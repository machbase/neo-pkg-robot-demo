# Machbase Neo Robot Arm Physical AI Demo

Web-based 3D robot arm Physical AI demo for Machbase Neo. The app stores DROID-style robot manipulation timelines in one JSON TAG table and visualizes joint, gripper, and end-effector state through a local Three.js frontend.

## Runtime

This project targets Machbase Neo JSH, not plain Node.js.

Ask for the local `machbase-neo` executable path before running scripts:

```sh
<machbase-neo> jsh scripts/schema.js
<machbase-neo> jsh scripts/download-data.js --out data/raw/droid
<machbase-neo> jsh scripts/ingest.js --data-root data/raw/droid --min-duration-sec 600
<machbase-neo> jsh app/server.js --host 127.0.0.1 --port 56803
```

Machbase Neo DB defaults to `127.0.0.1:5656`, user `sys`, password `manager`.

## Dataset Policy

The preferred source is a DROID subset, especially `gs://gresearch/robotics/droid_100` for initial setup. Dataset files are stored under `data/raw/` and are not committed.

DROID raw episodes contain `trajectory.h5`. JSH has no built-in HDF5 reader, so the ingest script reads normalized `trajectory.json`, `trajectory.ndjson`, or `trajectory.csv` files placed in each episode directory. If only `trajectory.h5` exists, the script reports the episode as needing conversion instead of silently fabricating data.

## Table

The demo uses a single TAG table with `TAG_PARTITION_COUNT=1`.

- `PHY_ROBOT_TIMELINE`: stores both `kind="state"` robot frames and `kind="event"` timeline markers in `value JSON SUMMARIZED`.
- JSON path rollups are created for numeric fields such as `$.derived.ee_speed`, `$.derived.motion_energy`, `$.derived.anomaly_score`, `$.derived.path_length`, and `$.robot.gripper`.
- JSON path indexes are created for `$.kind`, `$.event.type`, `$.event.severity`, and `$.frame.id`.

## Frontend

The browser app uses vendored Three.js files in `public/vendor/` and does not depend on CDN-hosted libraries at runtime.
