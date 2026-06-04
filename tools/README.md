# BFD HMI licence tooling (SAE side)

Offline kill-switch for the on-panel HMI. A licence is a small signed JSON file
checked **locally** by the backend against the **local clock**, so enforcement
works with the internet unplugged. SAE holds the Ed25519 private key; the panel
ships only the public key, so the customer cannot forge or extend a licence.

## Policy (no-sabotage, telegraphed)
- A lock **never stops running equipment** — it only refuses to START / change
  settings. STOP always works.
- `warn` date ("Monday") → on-screen amber banner counting down.
- `expires` date ("Friday") → control start-locked, red banner.
- Clock-rollback is defeated by a persistent high-water timestamp on the panel.

## Keys
- Private: `~/.claude/secrets/bfa-license-signing.key` (base64 raw Ed25519, mode 600).
  Mirrored in Bitwarden. **Never commit.**
- Public: embedded in `backend/app/license.py` (`DEFAULT_PUBKEY_B64`). Committed.

To regenerate the pair (invalidates all existing licences):
```python
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization
import base64
p = Ed25519PrivateKey.generate()
print("priv", base64.b64encode(p.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption())).decode())
print("pub ", base64.b64encode(p.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)).decode())
```

## Mint + install a licence
```bash
python3 tools/mint_license.py \
  --customer "Banana Feeds Australia" \
  --machine-id bfa-hmi-01 \
  --warn 2026-08-24 --expires 2026-08-28 \
  --out /tmp/license.json

scp /tmp/license.json bfa-hmi-zt:~/bfa-dryer-frontend/data/license.json
```
The backend re-reads the licence whenever the file mtime changes (within one
poll, ~0.5 s) — no restart needed. To renew when the customer pays: mint a new
licence with a later `expires` and scp it over Zerotier.

## Disable the lockout permanently (paid in full)

Mint a **perpetual** licence — never warns, never locks — and push it. Still
signed and machine-bound, so it is SAE-controlled and works offline forever:
```bash
python3 tools/mint_license.py \
  --customer "Banana Feeds Australia" \
  --machine-id bfa-hmi-01 \
  --perpetual --out /tmp/license.json

scp /tmp/license.json bfa-hmi-zt:~/bfa-dryer-frontend/data/license.json
```
`GET /api/license` then shows `status: ok`, `message: "Licensed (perpetual)"`,
`expires: null` — no banner, controls always available.

Blunt alternative (turns the whole mechanism off on the box, not signed):
set `LICENSE_ENFORCE=false` in the panel `.env` and `docker compose up -d`.
Prefer the perpetual licence — it keeps the audit trail and stays revocable.

## Panel config
- `MACHINE_ID=bfa-hmi-01` in the panel `.env` (must match `--machine-id`).
- `LICENSE_ENFORCE=true` (default). Set `false` only for a dev box.
- Licence + high-water live in the `./data` volume:
  `data/license.json`, `data/.license_hw`.

## Check status
```bash
curl -s http://localhost/api/license | python3 -m json.tool
```
