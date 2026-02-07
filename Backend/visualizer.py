from flask import Flask, jsonify
from flask_cors import CORS
from web3 import Web3
import json
import  os, json
from flask import Flask,  jsonify
from flask_cors import CORS
from web3 import Web3
from dotenv import load_dotenv
import numpy as np
import secrets

app = Flask(__name__)
CORS(app)

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

ec = w3.eth.contract(
    address=Web3.to_checksum_address(EC_CONTRACT_ADDRESS),
    abi=ec_abi
)
voting = w3.eth.contract(address=VOTING_CONTRACT_ADDRESS, abi=voting_abi)
VOTER_ACCOUNT = w3.eth.account.from_key(VOTER_PRIVATE_KEY).address


# ----------------------------
# MOCK BLOCK BUILDER
# ----------------------------
def build_block(event_name, details, block_number):
    return {
        "blockNumber": block_number,
        "event": event_name,
        "details": details
    }

# ----------------------------
# API: FETCH BLOCKCHAIN EVENTS
# ----------------------------
@app.route("/api/blocks")
def get_blocks():
    blocks = []

    # ---- PARTY ADDED EVENTS ----
    party_logs = ec.events.PartyAdded.get_logs(from_block=0)
    for e in party_logs:
        blocks.append(build_block(
            "Party Added",
            dict(e["args"]),
            e["blockNumber"]
        ))

    # ---- CANDIDATE ADDED EVENTS ----
    candidate_logs = ec.events.CandidateAdded.get_logs(from_block=0)
    for e in candidate_logs:
        blocks.append(build_block(
            "Candidate Added",
            dict(e["args"]),
            e["blockNumber"]
        ))

    # ---- VOTE CAST EVENTS ----
    vote_logs = voting.events.VoteCast.get_logs(from_block=0)
    for e in vote_logs:
        blocks.append(build_block(
            "Vote Cast",
            dict(e["args"]),
            e["blockNumber"]
        ))

    blocks.sort(key=lambda x: x["blockNumber"])
    return jsonify(blocks)


# ----------------------------
# API: RESULTS
# ----------------------------
@app.route("/api/results/<booth>/<int:candidate>")
def results(booth, candidate):
    votes = voting.functions.getVoteCount(booth, candidate).call()
    return jsonify({
        "booth": booth,
        "candidate": candidate,
        "votes": votes
    })

if __name__ == "__main__":
    app.run(port=5001,debug=True)
