from flask import Flask, Response, request, jsonify, send_from_directory
from flask_cors import CORS
import csv, os, cv2, json, time, threading
from PIL import Image
import torch
from torch.nn.functional import cosine_similarity
from facenet_pytorch import MTCNN, InceptionResnetV1
from web3 import Web3
from twilio.rest import Client
from dotenv import load_dotenv
import numpy as np
import secrets

# ------------------------------
# Load .env
# ------------------------------
load_dotenv()

TWILIO_SID = os.getenv("TWILIO_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE = os.getenv("TWILIO_PHONE")

VOTING_CONTRACT_ADDRESS = os.getenv("VITE_VOTING_CONTRACT_ADDRESS")
EC_CONTRACT_ADDRESS = os.getenv("VITE_EC_CONTRACT_ADDRESS")
VOTER_PRIVATE_KEY = os.getenv("VOTER_PRIVATE_KEY")
ALCHEMY_URL = os.getenv("ALCHEMY_URL")

otp_store = {}

print("🔥 APP.PY RUNNING (FAST FACE AUTH ENABLED) 🔥")

app = Flask(__name__, static_folder='../Frontend', static_url_path='/static')
CORS(app)

# ------------------------------
# Globals
# ------------------------------
current_epic = None
current_polling_id = None

camera_active = False
latest_frame = None
camera_thread = None

# 🔥 FACE CACHE
face_cache = {}  # EPIC -> list of embeddings
voted_face_cache = []  # list of EPICs who have voted
# 🔥 CANDIDATE CACHE (KEY FIX)
candidate_cache = {}  # polling_id -> candidates list
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_BASE = os.path.join(BASE_DIR, 'Dataset', 'P1')

print("📁 Dataset base:", DATASET_BASE)

# ------------------------------
# Blockchain setup
# ------------------------------
w3 = Web3(Web3.HTTPProvider(ALCHEMY_URL))
assert w3.is_connected()

with open("VotingABI.json") as f:
    voting_abi = json.load(f)

voting_contract = w3.eth.contract(
    address=Web3.to_checksum_address(VOTING_CONTRACT_ADDRESS),
    abi=voting_abi
)

with open("EC_ABI.json") as f:
    ec_abi = json.load(f)

ec_contract = w3.eth.contract(
    address=Web3.to_checksum_address(EC_CONTRACT_ADDRESS),
    abi=ec_abi
)

VOTER_ACCOUNT = w3.eth.account.from_key(VOTER_PRIVATE_KEY).address

# ------------------------------
# Load voters
# ------------------------------
CSV_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'Dataset', 'dummy_voters.csv')
with open(CSV_PATH, newline='', encoding='utf-8') as f:
    voters = list(csv.DictReader(f))

# ------------------------------
# Face models
# ------------------------------
mtcnn = MTCNN(image_size=160)
model = InceptionResnetV1(pretrained='vggface2').eval()
DATASET_BASE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'Dataset', 'P1')

# ------------------------------
# Camera loop
# ------------------------------
def camera_loop():
    global latest_frame, camera_active
    cap = cv2.VideoCapture(0)

    while camera_active:
        ret, frame = cap.read()
        if ret:
            latest_frame = frame
        time.sleep(0.03)

    cap.release()

# ------------------------------
# Frontend
# ------------------------------
@app.route('/')
def serve_frontend():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)

# ------------------------------
# Voting status
# ------------------------------
@app.route("/voting-status")
def voting_status():
    voting_started = ec_contract.functions.votingStarted().call()
    voting_ended = ec_contract.functions.votingEnded().call()
    
    print("🟢 started:", voting_started, "⛔ ended:", voting_ended)

    return jsonify({
        "started": voting_started,
        "ended": voting_ended
    })

# ------------------------------
# EPIC verification
# ------------------------------
@app.route('/verify-epic', methods=['POST'])
def verify_epic():
    global current_epic, current_polling_id

    epic = request.json.get('epic', '').strip().upper()
    voter = next((v for v in voters if v['EPIC_ID'].upper() == epic), None)

    if not voter:
        return jsonify({'status': 'not_found'})

    current_epic = epic
    current_polling_id = voter['Polling_Booth_ID']

    if epic not in face_cache:
        embeddings = []
        folder = os.path.join(DATASET_BASE, epic)

        for img_name in os.listdir(folder):
            img = cv2.imread(os.path.join(folder, img_name))
            if img is None:
                continue

            face = mtcnn(Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))
            if face is not None:
                embeddings.append(model(face.unsqueeze(0)))

        face_cache[epic] = embeddings
        print(f"✅ Cached {len(embeddings)} face embeddings for {epic}")

    return jsonify({
        'status': 'found',
        "data": {
            "Name": voter["Name"],
            "Age": voter["Age"],
            "Phone_Number": voter["Phone_Number"],
            "EPIC_ID": voter["EPIC_ID"],
            "Gender": voter["Gender"],
            "Assembly_Constituency": voter["Assembly_Constituency"],
            "Polling_Station_Name": voter["Polling_Station_Name"],
            "State": voter["State"],
            "District": voter["District"]
        }
    })

# ------------------------------
# Twilio Client
# ------------------------------
client = Client(TWILIO_SID, TWILIO_AUTH_TOKEN)

# ---------------- OTP CONFIG ----------------
OTP_EXPIRY_SECONDS = 180      # 3 minutes

# ---------------- Helper ----------------
def clean_mobile(mobile):
    """Remove spaces, +, - from number for uniform comparison"""
    return mobile.replace(" ", "").replace("-", "").replace("+", "").strip()

# ---------------- Send OTP ----------------
@app.route("/send-otp", methods=["POST"])
def send_otp():
    mobile = request.json.get("mobile")
    if not mobile:
        return jsonify({"status": "error", "message": "Mobile number required"}), 400

    mobile_clean = clean_mobile(mobile)

    # find voter by cleaned number
    voter = next((v for v in voters if clean_mobile(v["Phone_Number"]) == mobile_clean), None)
    if not voter:
        return jsonify({"status": "not_found"})

    # prevent spamming OTP repeatedly
    existing = otp_store.get(mobile_clean)
    if existing and existing["expires"] > time.time() - 20:
        return jsonify({"status": "wait", "message": "Please wait before requesting again"})

    # secure OTP generation
    otp = str(secrets.randbelow(900000) + 100000)

    otp_store[mobile_clean] = {
        "otp": otp,
        "expires": time.time() + OTP_EXPIRY_SECONDS
    }

    # send SMS via Twilio
    try:
        client.messages.create(
            body=f"Your voting verification OTP is: {otp}. It expires in 3 minutes.",
            from_=TWILIO_PHONE,
            to=mobile
        )
    except Exception as e:
        print("❌ SMS error:", e)
        return jsonify({"status": "error", "message": "Failed to send OTP SMS"}), 500

    return jsonify({"status": "sent", "message": "OTP sent successfully"})

# ---------------- Verify OTP ----------------
@app.route("/verify-otp", methods=["POST"])
def verify_otp():
    mobile = request.json.get("mobile")
    otp_input = request.json.get("otp")
    if not mobile or not otp_input:
        return jsonify({"status": "error", "message": "Mobile and OTP required"}), 400

    mobile_clean = clean_mobile(mobile)
    rec = otp_store.get(mobile_clean)

    if not rec:
        return jsonify({"status": "invalid", "message": "Request OTP first"})

    if rec["expires"] < time.time():
        otp_store.pop(mobile_clean, None)
        return jsonify({"status": "expired", "message": "OTP expired"})

    if rec["otp"] != otp_input:
        return jsonify({"status": "invalid", "message": "Invalid OTP"})

    # success — cleanup
    otp_store.pop(mobile_clean, None)

    # get voter info
    voter = next((v for v in voters if clean_mobile(v["Phone_Number"]) == mobile_clean), None)
    if not voter:
        return jsonify({"status": "error", "message": "Voter not found"}), 404

    return jsonify({
        "status": "success",
        "data": voter
    })

# ------------------------------
# Broadcast SMS to all voters
# ------------------------------
def broadcast_sms(message_text):
    sent = 0
    failed = 0

    for v in voters:
        mobile = v.get("Phone_Number", "").strip()
        if not mobile:
            continue

        try:
            client.messages.create(
                body=message_text,
                from_=TWILIO_PHONE,
                to=mobile
            )
            sent += 1
        except Exception as e:
            print("❌ Broadcast error:", mobile, e)
            failed += 1

    return {"sent": sent, "failed": failed}

@app.route("/notify-voting-start", methods=["POST"])
def notify_voting_start():
    result = broadcast_sms(
        "Voting is Started. Please visit nearest polling booth and cast your vote!"
    )
    return jsonify({"status": "ok", **result})

@app.route("/notify-voting-end", methods=["POST"])
def notify_voting_end():
    result = broadcast_sms("Voting has ended.")
    return jsonify({"status": "ok", **result})

# ------------------------------
# Start / stop camera
# ------------------------------
@app.route('/start-camera')
def start_camera():
    global camera_active, camera_thread
    if not camera_active:
        camera_active = True
        camera_thread = threading.Thread(target=camera_loop)
        camera_thread.start()
    return jsonify({'status': 'started'})

@app.route('/stop-camera')
def stop_camera():
    global camera_active
    camera_active = False
    return jsonify({'status': 'stopped'})

# ------------------------------
# Video feed
# ------------------------------
@app.route('/video-feed')
def video_feed():
    def gen():
        while camera_active and latest_frame is not None:
            _, buffer = cv2.imencode('.jpg', latest_frame)
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' +
                   buffer.tobytes() + b'\r\n')
    return Response(gen(), mimetype='multipart/x-mixed-replace; boundary=frame')


voted_face_embeddings = []   # GLOBAL

@app.route('/verify-face', methods=['POST'])
def verify_face():

    if latest_frame is None:
        return jsonify({'status': 'no_face'})

    # Convert frame
    rgb = cv2.cvtColor(latest_frame, cv2.COLOR_BGR2RGB)
    img_pil = Image.fromarray(rgb)

    # Detect face
    face = mtcnn(img_pil)
    if face is None:
        return jsonify({'status': 'no_face'})

    # Generate live embedding
    with torch.no_grad():
        live_embedding = model(face.unsqueeze(0))

    # 🔒 FACE-BASED VOTE LOCK CHECK
    for voted_emb in voted_face_embeddings:
        sim = cosine_similarity(live_embedding, voted_emb).item()
        if sim >= 0.7:
            return jsonify({
                'status': 'already_voted',
                'similarity': sim
            })

    # 🔍 EPIC-based identity verification
    if current_epic not in face_cache:
        return jsonify({'status': 'not_registered'})

    similarities = []
    for stored_emb in face_cache[current_epic]:
        sim = cosine_similarity(live_embedding, stored_emb).item()
        similarities.append(sim)

    best_similarity = max(similarities)

    THRESHOLD_VERIFY = 0.6

    if best_similarity < THRESHOLD_VERIFY:
        return jsonify({
            'status': 'failed',
            'similarity': best_similarity
        })

    # ✅ Face verified BUT NOT LOCKED YET
    return jsonify({
        'status': 'success',
        'similarity': best_similarity
    })


@app.route('/verify-vote-face', methods=['POST'])
def verify_vote_face():
    global latest_frame, current_epic

    print("🆔 current_epic =", current_epic)

    if latest_frame is None:
        return jsonify({'status': 'no_face'})

    # Absolute EPIC folder path
    person_dir = os.path.join(DATASET_BASE, current_epic)
    print("📁 Checking folder:", person_dir)

    if not os.path.isdir(person_dir):
        return jsonify({
            'status': 'not_registered',
            'message': 'Face dataset not found for EPIC'
        })

    # Convert live frame
    rgb = cv2.cvtColor(latest_frame, cv2.COLOR_BGR2RGB)
    live_pil = Image.fromarray(rgb)

    face = mtcnn(live_pil)
    if face is None:
        return jsonify({'status': 'no_face'})

    with torch.no_grad():
        live_embedding = model(face.unsqueeze(0))

    best_similarity = 0.0

    # Compare with dataset images
    for img_name in os.listdir(person_dir):
        img_path = os.path.join(person_dir, img_name)

        img = cv2.imread(img_path)
        if img is None:
            continue

        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        img_pil = Image.fromarray(img_rgb)

        stored_face = mtcnn(img_pil)
        if stored_face is None:
            continue

        with torch.no_grad():
            stored_embedding = model(stored_face.unsqueeze(0))

        sim = cosine_similarity(live_embedding, stored_embedding).item()
        best_similarity = max(best_similarity, sim)

    print("🔍 Best similarity:", best_similarity)

    if best_similarity >= 0.6:
        return jsonify({
            'status': 'verified',
            'similarity': best_similarity
        })
    else:
        return jsonify({
            'status': 'failed',
            'similarity': best_similarity,
            'message': 'Face mismatch, adjust lighting'
        })



# ------------------------------
# Get candidates
# ------------------------------
@app.route('/get-candidates')
def get_candidates():
    if not current_polling_id:
        return jsonify({'status': 'ok', 'candidates': []})

    if current_polling_id in candidate_cache:
        return jsonify({
            'status': 'ok',
            'polling_id': current_polling_id,
            'candidates': candidate_cache[current_polling_id]
        })

    try:
        ids, names, parties, votes = ec_contract.functions.getCandidatesByBooth(
            current_polling_id
        ).call()

        if len(ids) == 0:
            candidate_cache[current_polling_id] = []
            return jsonify({'status': 'ok', 'candidates': []})

        candidates = []
        for i in range(len(ids)):
            candidates.append({
                "Candidate_ID": int(ids[i]),
                "Candidate_Name": names[i],
                "Party_Name": parties[i],
                "Votes": int(votes[i])
            })

        candidate_cache[current_polling_id] = candidates

        return jsonify({
            'status': 'ok',
            'polling_id': current_polling_id,
            'candidates': candidates
        })

    except Exception as e:
        print("❌ Candidate fetch error:", e)
        return jsonify({'status': 'error', 'candidates': []})

# ------------------------------
# Cast vote
# ------------------------------
@app.route('/cast-vote', methods=['POST'])
def cast_vote():
    try:
        data = request.json
        if not data or 'candidate_id' not in data:
            return jsonify({
                'status': 'error',
                'message': 'candidate_id required'
            }), 400

        candidate_id = int(data['candidate_id'])

        # 1️⃣ Check voting state from EC contract
        if not ec_contract.functions.votingStarted().call():
            return jsonify({
                'status': 'error',
                'message': 'Voting not started'
            }), 400

        if ec_contract.functions.votingEnded().call():
            return jsonify({
                'status': 'error',
                'message': 'Voting has ended'
            }), 400

        # 2️⃣ Prepare vote parameters
        polling_booth_id = current_polling_id        # string
        epic_hash = w3.keccak(text=current_epic)     # bytes32

        # 3️⃣ DRY RUN (VERY IMPORTANT)
        # This catches revert reasons BEFORE spending gas
        try:
            voting_contract.functions.castVote(
                polling_booth_id,
                candidate_id,
                epic_hash
            ).call({'from': VOTER_ACCOUNT})
        except Exception as e:
            return jsonify({
                'status': 'error',
                'message': f'Vote rejected: {str(e)}'
            }), 400

        # 4️⃣ Build transaction
        nonce = w3.eth.get_transaction_count(VOTER_ACCOUNT, 'pending')

        txn = voting_contract.functions.castVote(
            polling_booth_id,
            candidate_id,
            epic_hash
        ).build_transaction({
            'from': VOTER_ACCOUNT,
            'nonce': nonce,
            'gas': 500000,                     # safer gas limit
            'gasPrice': w3.eth.gas_price
        })

        # 5️⃣ Sign & send
        signed_txn = w3.eth.account.sign_transaction(
            txn,
            private_key=VOTER_PRIVATE_KEY
        )

        tx_hash = w3.eth.send_raw_transaction(
            signed_txn.raw_transaction
        )

        # ⏳ WAIT FOR BLOCKCHAIN CONFIRMATION
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

        # 🔑 Extract Vote Receipt Hash from VoteCast event
        logs = voting_contract.events.VoteCast().process_receipt(receipt)

        if not logs:
            return jsonify({
                'status': 'error',
                'message': 'Vote event not found'
            }), 500
        receipt_hash = logs[0]['args']['receiptHash'].hex()


        # ❌ If blockchain reverted, STOP
        if receipt.status != 1:
            return jsonify({
                'status': 'error',
                'message': 'Transaction failed on blockchain'
            }), 400
       
        # ✅ FETCH CANDIDATE DETAILS (from EC contract) 
        candidate = ec_contract.functions.candidates(
            polling_booth_id,
            candidate_id
        ).call()
        candidate_name = candidate[1]
        party = candidate[2]
        
    

        # 🔒 LOCK FACE ONLY AFTER SUCCESS
        if latest_frame is not None:
            rgb = cv2.cvtColor(latest_frame, cv2.COLOR_BGR2RGB)
            face = mtcnn(Image.fromarray(rgb))
            if face is not None:
                with torch.no_grad():
                    emb = model(face.unsqueeze(0))
                    voted_face_embeddings.append(emb)

        print("✅ Vote stored + face locked for EPIC:", current_epic)

        return jsonify({
            'status': 'success',
            'message': 'Vote cast successfully',
            'receiptHash': receipt_hash
        })

    except Exception as e:
        print("❌ Vote error:", str(e))
        return jsonify({
            'status': 'error',
            'message': f'Vote error: {str(e)}'
        }), 500



def save_vote_to_csv(hash_key, candidate_id, candidate_name, party, polling_booth):
    # Absolute path to Dataset folder (project-root/Dataset)
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dataset_dir = os.path.join(base_dir, "Dataset")
    file_path = os.path.join(dataset_dir, "hashKey.csv")

    # Ensure Dataset folder exists
    os.makedirs(dataset_dir, exist_ok=True)

    file_exists = os.path.isfile(file_path)

    with open(file_path, mode='a', newline='', encoding='utf-8') as file:
        writer = csv.writer(file)

        if not file_exists:
            writer.writerow([
                "hashKey",
                "candidateId",
                "candidateName",
                "party",
                "pollingBoothId"
            ])

        writer.writerow([
            hash_key,
            candidate_id,
            candidate_name,
            party,
            polling_booth
        ])

    print("✅ Vote stored in CSV:", hash_key)
    return jsonify({"status": "success", "message": "Vote stored in CSV"}), 200


@app.route('/verify-hash', methods=['POST'])
def verify_hash():
    try:
        data = request.get_json(force=True)
        print("📥 Incoming data:", data)

        hash_key = data.get("hashKey")
        if not hash_key:
            return jsonify({"status": "error", "message": "Missing hashKey"}), 400

        BASE_DIR = os.path.dirname(os.path.abspath(__file__))
        PROJECT_ROOT = os.path.dirname(BASE_DIR)
        csv_path = os.path.join(PROJECT_ROOT, "Dataset", "hashKey.csv")

        print("📄 CSV PATH:", csv_path)

        if not os.path.exists(csv_path):
            return jsonify({"status": "error", "message": "CSV file not found"}), 500

        with open(csv_path, newline='', encoding='utf-8') as file:
            reader = csv.DictReader(file)

            for row in reader:
                print("🔍 Checking row:", row)
                if row.get("hashKey") == hash_key:
                    return jsonify({
                        "status": "success",
                        "vote": row
                    })

        return jsonify({"status": "error", "message": "Hash not found"}), 404

    except Exception as e:
        print("❌ VERIFY HASH ERROR:", str(e))
        return jsonify({"status": "error", "message": "Internal server error"}), 500




@app.route("/verify-vote/<tx_hash>", methods=["GET"])
def verify_vote_hash(tx_hash):
    try:
        receipt = w3.eth.get_transaction_receipt(tx_hash)

        # ⚠️ Your contract probably emits "VoteCast", not "VoteCasted"
        logs = voting_contract.events.VoteCast().process_receipt(receipt)

        if not logs:
            return jsonify({"status": "error", "message": "No vote event found"}), 404

        event = logs[0]["args"]

        booth_id = event["pollingBoothId"]
        candidate_id = int(event["candidateId"])

        # candidate is stored in EC contract — not voting contract
        candidate = ec_contract.functions.candidates(booth_id, candidate_id).call()

        return jsonify({
            "status": "success",
            "booth_id": booth_id,
            "candidate_id": candidate_id,
            "candidate_name": candidate[1],
            "party_name": candidate[2]
        })

    except Exception as e:
        print("❌ VERIFY ERROR:", str(e))
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/reset-face-cache", methods=["POST"])
def reset_face_cache():
    global face_cache, voted_face_embeddings, current_epic, current_polling_id

    face_cache.clear()
    voted_face_embeddings.clear()
    current_epic = None
    current_polling_id = None

    print("🧹 FACE CACHE & VOTE LOCK RESET")

    return jsonify({
        "status": "ok",
        "message": "Face cache and vote lock reset successfully"
    })




# ------------------------------
# Add New Voter (BLO)
# ------------------------------
@app.route("/add-voter", methods=["POST"])
def add_voter():
    data = request.json

    required_fields = [
        "EPIC_ID", "Name", "Gender", "Age", "Phone_Number", "Relation",
        "Assembly_Constituency", "Polling_Station_Name", "Polling_Booth_ID",
        "Part_Number", "Serial_Number", "State", "District"
    ]

    # Validation
    for field in required_fields:
        if field not in data or not str(data[field]).strip():
            return jsonify({"status": "error", "message": f"{field} missing"}), 400

    csv_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "Dataset",
        "dummy_voters.csv"
    )

    # Prevent duplicate EPIC ID
    with open(csv_path, newline='', encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row["EPIC_ID"] == data["EPIC_ID"]:
                return jsonify({
                    "status": "error",
                    "message": "EPIC ID already exists"
                }), 400

    # Append voter
    with open(csv_path, "a", newline='', encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=required_fields)
        writer.writerow(data)

    print("✅ New voter added:", data["EPIC_ID"])

    return jsonify({
        "status": "success",
        "message": "Voter added successfully"
    })

@app.route("/get-voters/<polling_id>")
def get_voters(polling_id):
    with open(CSV_PATH, newline='', encoding="utf-8") as f:
        reader = csv.DictReader(f)
        voters = [v for v in reader if v["Polling_Booth_ID"] == polling_id]

    return jsonify({"status": "success", "voters": voters})

@app.route("/update-voter", methods=["POST"])
def update_voter():
    data = request.json
    epic = data.get("EPIC_ID")

    updated = False
    voters = []

    with open(CSV_PATH, newline='', encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for row in reader:
            if row["EPIC_ID"] == epic:
                row.update(data)
                updated = True
            voters.append(row)

    if not updated:
        return jsonify({"status": "error", "message": "Voter not found"}), 404

    with open(CSV_PATH, "w", newline='', encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(voters)

    return jsonify({"status": "success"})

@app.route("/delete-voter/<epic>", methods=["DELETE"])
def delete_voter(epic):
    voters = []
    deleted = False

    with open(CSV_PATH, newline='', encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for row in reader:
            if row["EPIC_ID"] == epic:
                deleted = True
                continue
            voters.append(row)

    if not deleted:
        return jsonify({"status": "error", "message": "Voter not found"}), 404

    with open(CSV_PATH, "w", newline='', encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(voters)

    return jsonify({"status": "success"})

@app.route("/blo-login", methods=["POST"])
def blo_login():
    data = request.json
    blo_id = data.get("blo_id")
    password = data.get("password")

    csv_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "Dataset",
        "dummy_blo.csv"
    )

    with open(csv_path, newline='', encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row["BLO_ID"] == blo_id:
                # 🔐 Password rule: BLO_ID@123
                expected_password = f"{blo_id}@123"

                if password == expected_password:
                    return jsonify({
                        "status": "success",
                        "Polling_Booth_ID": row["Polling_Booth_ID"]
                    })
                else:
                    return jsonify({
                        "status": "error",
                        "message": "Invalid password"
                    }), 401

    return jsonify({
        "status": "error",
        "message": "BLO ID not found"
    }), 401

@app.route("/request-edit", methods=["POST"])
def request_edit():
    data = request.json
    epic = data.get("EPIC_ID")

    # 1️⃣ Find voter
    voter = next((v for v in voters if v["EPIC_ID"] == epic), None)
    if not voter:
        return jsonify({"status": "error", "message": "Invalid EPIC"}), 400

    # 2️⃣ Get booth from voter (NOT from user)
    booth_id = voter["Polling_Booth_ID"]

    path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "Dataset",
        "voter_edit_requests.csv"
    )

    fieldnames = [
        "EPIC_ID",
        "Polling_Booth_ID",
        "Old_Name", "New_Name",
        "Old_Age", "New_Age",
        "Old_Phone", "New_Phone",
        "Status"
    ]

    request_row = {
        "EPIC_ID": epic,
        "Polling_Booth_ID": booth_id,
        "Old_Name": data["Old_Name"],
        "New_Name": data["New_Name"],
        "Old_Age": data["Old_Age"],
        "New_Age": data["New_Age"],
        "Old_Phone": data["Old_Phone"],
        "New_Phone": data["New_Phone"],
        "Status": "PENDING"
    }

    with open(path, "a", newline='', encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writerow(request_row)

    return jsonify({"status": "success"})

@app.route("/get-approvals/<booth_id>")
def get_approvals(booth_id):
    path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "Dataset",
        "voter_edit_requests.csv"
    )

    with open(path, newline='', encoding="utf-8") as f:
        reader = csv.DictReader(f)
        requests = [
            r for r in reader
            if r["Polling_Booth_ID"] == booth_id
            and r["Status"] == "PENDING"
        ]

    return jsonify({"requests": requests})

@app.route("/approve-request", methods=["POST"])
def approve_request():
    data = request.json
    epic = data["EPIC_ID"]

    # Update voters CSV
    with open(CSV_PATH, newline='', encoding="utf-8") as f:
        voters = list(csv.DictReader(f))
        fieldnames = voters[0].keys()

    for v in voters:
        if v["EPIC_ID"] == epic:
            v["Name"] = data["New_Name"]
            v["Age"] = data["New_Age"]
            v["Phone_Number"] = data["New_Phone"]

    with open(CSV_PATH, "w", newline='', encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(voters)

    # Mark approved
    update_request_status(epic, "APPROVED")

    return jsonify({"status": "success"})

def update_request_status(epic, status):
    path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "Dataset",
        "voter_edit_requests.csv"
    )

    with open(path, newline='', encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
        fieldnames = rows[0].keys()

    for r in rows:
        if r["EPIC_ID"] == epic:
            r["Status"] = status

    with open(path, "w", newline='', encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


@app.route("/reject-request", methods=["POST"])
def reject_request():
    epic = request.json["EPIC_ID"]
    update_request_status(epic, "REJECTED")
    return jsonify({"status": "success"})


@app.route("/verify-vote-by-hash", methods=["POST"])
def verify_vote_by_hash():
    try:
        data = request.json
        hash_key = data.get("hashKey")

        if not hash_key:
            return jsonify({"status": "error", "message": "Hash key required"}), 400

        # convert hex string → bytes32
        epic_hash = bytes.fromhex(hash_key.replace("0x", ""))

        booth, candidate_id, candidate_name, party = (
            voting_contract.functions.verifyMyVote(epic_hash).call()
        )

        return jsonify({
            "status": "success",
            "booth_id": booth,
            "candidate_id": candidate_id,
            "candidate_name": candidate_name,
            "party": party
        })

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 400


if __name__ == '__main__':
    app.run(debug=True)