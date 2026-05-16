#!/bin/sh
# BFA HMI kiosk session
# Screen + display: never blank, no DPMS, no cursor
xset s off
xset s noblank
xset -dpms
unclutter -idle 1 -root &

# Session dbus for WebKit child processes
eval "$(dbus-launch --sh-syntax --exit-with-session)"
export DBUS_SESSION_BUS_ADDRESS DBUS_SESSION_BUS_PID

# Window manager — openbox forces all windows fullscreen via ~/.config/openbox/rc.xml
openbox &
sleep 1

# Background watcher: dismiss the 'Set as Default Browser' nag that epiphany
# shows every launch in incognito mode.
(
  while :; do
    sleep 3
    for wid in $(xdotool search --name 'Set as Default Browser' 2>/dev/null); do
        xdotool windowactivate "$wid" 2>/dev/null
        xdotool key --window "$wid" Escape 2>/dev/null
    done
  done
) &

# Browser loop — relaunch if it dies. Openbox rule makes it fullscreen on map.
while :; do
    epiphany --incognito-mode http://localhost/ >/tmp/epiphany.log 2>&1
    sleep 2
done
