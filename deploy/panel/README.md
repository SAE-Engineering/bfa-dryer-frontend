# BFA Dryer HMI — on-panel (production) deployment

The HMI runs **entirely on the Lenovo M700 1L panel `bfa-hmi-01`** — no dependency on
bosun. The panel boots straight into a locked, full-screen kiosk showing the local stack,
stays awake, and self-heals from crashes and power loss.

## Hardware / network
- **Panel:** Lenovo M700 1L, Ubuntu 24.04, user `bfa` (passwordless sudo).
- **Display:** Lilliput FA1019, 10.1" 1920x1200 landscape cap-touch.
- **Network:** `eno1` on the PLC LAN `10.10.10.0/24` (DHCP, ~`10.10.10.51`). The Schneider
  M221 PLC is at `10.10.10.10:502`. Internet egress works directly on this LAN.
- **Remote admin:** over Zerotier — `ssh bfa-hmi-zt` (`10.244.70.180`). The old
  `bfa-hmi` alias (ProxyJump bosun -> 10.0.2.60) is dead since the 2026-05-30 net reshuffle.

## Stack (Docker, local)
```
sudo apt-get install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo usermod -aG docker bfa

git clone https://github.com/SAE-Engineering/bfa-dryer-frontend.git ~/bfa-dryer-frontend
cd ~/bfa-dryer-frontend
cp .env.panel.example .env          # PLC_SIM=true by default
docker compose -f docker-compose.yml -f docker-compose.panel.yml up -d --build
```
- `restart: unless-stopped` + `docker.service` enabled => containers auto-start on boot.
- frontend on host **:80** (kiosk) and **:5054** (remote viewing over ZT); backend :8000 internal.

### *** SIM vs LIVE ***
Default `PLC_SIM=true` — nothing physical moves. **To arm live control of the dryer
(on-site, attended only):** edit `.env` -> `PLC_SIM=false`, then
`docker compose -f docker-compose.yml -f docker-compose.panel.yml up -d`.

## Kiosk (X / openbox / epiphany)
Required packages (the LAN has internet, so apt works directly):
```
sudo apt-get install -y xserver-xorg xinit openbox unclutter epiphany-browser \
     xdotool dbus-x11 x11-xserver-utils x11-utils scrot
```
- `getty@tty1` autologins `bfa`; `~/.bash_profile` (see `bash_profile`) loops `startx`
  so X self-restarts on crash.
- `~/.xinitrc` (see `xinitrc`): disables DPMS/blanking (`xset`), runs openbox, then a
  browser loop that relaunches epiphany and presses **F11 until `_NET_WM_STATE_FULLSCREEN`
  is actually set**. Epiphany draws its own GTK toolbar; only its F11 hides it.
- openbox `~/.config/openbox/rc.xml`: the `name="*"` rule must be
  `<fullscreen>no</fullscreen>` with `<decor>no</decor>` + `<maximized>true</maximized>`.
  openbox forcing fullscreen fights epiphany F11, so let epiphany own fullscreen.
- Kill the "Set as Default Browser" nag (an in-window GTK dialog xdotool cannot dismiss):
  ```
  # ~/.config is root-owned from provisioning, so dconf cannot write until fixed:
  sudo mkdir -p ~/.config/dconf && sudo chown bfa:bfa ~/.config/dconf
  gsettings set org.gnome.Epiphany ask-for-default false
  ```

## Self-heal summary
| Failure | Recovery |
|---|---|
| Container crash | `restart: unless-stopped` |
| Docker daemon / reboot / power loss | `docker.service` enabled; containers restart on boot |
| Browser crash | xinitrc `while` loop respawns epiphany |
| X server crash | `~/.bash_profile` loops `startx` |

Validated 2026-06-04 by two cold reboots — panel returns unattended to the locked
full-screen HMI on `http://localhost/`.
