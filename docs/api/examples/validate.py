"""Validate an IFC and wait for the result. Usage: python validate.py Model.ifc [profile]"""
import os
import sys
import time

import requests

api, key = os.environ["IFCVO_API_URL"], os.environ["IFCVO_API_KEY"]
auth = {"Authorization": f"Bearer {key}"}
path = sys.argv[1]
data = {"profile": sys.argv[2]} if len(sys.argv) > 2 else {}

with open(path, "rb") as f:
    r = requests.post(f"{api}/v1/validations", headers=auth, files={"file": f}, data=data, timeout=300)
r.raise_for_status()
v = r.json()

while v["status"] in ("queued", "running"):
    time.sleep(5)
    v = requests.get(f"{api}/v1/validations/{v['id']}", headers=auth, timeout=30).json()

print(f"{v['file_name']}: {v['status']}, score {v['score']} - {v.get('view_url') or ''}")
sys.exit(0 if v["status"] == "passed" else 1)
