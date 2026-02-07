import cv2
from facenet_pytorch import MTCNN, InceptionResnetV1
import torch
from torch.nn.functional import cosine_similarity
from PIL import Image
import os
import sys
import json

# Load models
mtcnn = MTCNN(image_size=160, margin=0)
model = InceptionResnetV1(pretrained='vggface2').eval()

# ------------------------------
# BUILD FACE DATABASE
# ------------------------------
face_db = {}
known_folder = "./Dataset/P1/"   # Correct path (case sensitive!)

for voter_folder in os.listdir(known_folder):
    folder_path = os.path.join(known_folder, voter_folder)

    if not os.path.isdir(folder_path):
        continue

    for img_name in os.listdir(folder_path):
        img_path = os.path.join(folder_path, img_name)
        img = cv2.imread(img_path)
        if img is None:
            continue
            
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        img_pil = Image.fromarray(img_rgb)

        face = mtcnn(img_pil)
        if face is None:
            continue

        embedding = model(face.unsqueeze(0))
        face_db[voter_folder] = embedding   # One embedding per voter folder
        break  # stop after 1 embedding image per voter

print("Face database prepared for", len(face_db), "voters")


# ------------------------------
# FUNCTION: VERIFY FACE
# ------------------------------
def verify_face(voter_id, image_path):
    try:
        if voter_id not in face_db:
            return False

        known_embedding = face_db[voter_id]

        test_img = cv2.imread(image_path)
        if test_img is None:
            return False

        test_rgb = cv2.cvtColor(test_img, cv2.COLOR_BGR2RGB)
        test_pil = Image.fromarray(test_rgb)

        face = mtcnn(test_pil)
        if face is None:
            return False

        test_embedding = model(face.unsqueeze(0))
        sim = cosine_similarity(test_embedding, known_embedding)

        print("Similarity:", sim.item())

        return sim.item() > 0.7  # threshold
    except Exception as e:
        print("Error:", str(e))
        return False


# ------------------------------
# SCRIPT ENTRY POINT FOR NODE
# ------------------------------
if __name__ == "__main__":
    voter_id = sys.argv[1]       # EPIC/Voter Folder
    image_path = sys.argv[2]     # Image file path

    success = verify_face(voter_id, image_path)
    print(json.dumps({"success": success}))
    sys.stdout.flush()
