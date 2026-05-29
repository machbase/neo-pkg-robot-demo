# Machbase Neo 로봇 Physical AI 데모

Machbase Neo에서 DROID/LeRobot 로봇 조작 데이터를 저장하고 재생하는 3D 데모입니다.

이 데모는 로봇의 frame-level time-series 데이터를 하나의 JSON TAG 테이블에 저장하고, 브라우저에서 로봇 팔 움직임, timeline, metric chart, event marker를 함께 보여줍니다.

## 실행 환경

이 프로젝트는 일반 Node.js가 아니라 **Machbase Neo JSH runtime**을 대상으로 합니다.

예시 경로:

```sh
~/work/neo/current/machbase-neo
```

DB 접속 기본값:

```text
host: 127.0.0.1
port: 5656
user: sys
password: manager
```

## 데이터 출처

사용 데이터는 DROID 데이터셋의 LeRobot 변환본인 `lerobot/droid_100`입니다.

참고:

- DROID 공식 데이터셋: https://droid-dataset.github.io/
- Hugging Face LeRobot droid_100: https://huggingface.co/datasets/lerobot/droid_100

로컬 데이터 구조:

```text
data/raw/droid_lerobot/
├── data/chunk-000/file-000.parquet
├── meta/info.json
├── meta/tasks.parquet
├── meta/episodes/chunk-000/file-000.parquet
├── conversion-summary.json
└── episodes/episode_*/trajectory.ndjson
```

`data/chunk-000/file-000.parquet`가 frame-level 원본에 가까운 LeRobot parquet 데이터입니다.

`episodes/episode_*/trajectory.ndjson`는 JSH ingest가 쉽게 읽을 수 있도록 만든 데모용 변환본입니다. 현재 ingest script는 이 NDJSON 파일들을 읽습니다.

## 데이터 명세

원본 LeRobot 명세 기준:

- episodes: 100개
- frames: 32,212개
- fps: 15
- 주요 필드:
  - `observation.state`: 7축 motor state
  - `action`: 7축 action vector
  - `timestamp`
  - `episode_index`
  - `frame_index`
  - `task_index`
  - `next.reward`
  - `next.done`

현재 로딩은 원본 fps에 맞추기 위해 `--sample-ms 67`을 사용합니다. 정확한 15fps 간격은 66.666...ms이지만 ingest 옵션은 정수 ms를 사용합니다.

## 테이블 구조

이 데모는 기존처럼 frame/signal/event를 여러 테이블로 나누지 않고, 하나의 TAG 테이블만 사용합니다.

```text
PHY_ROBOT_TIMELINE
```

특징:

- `value JSON SUMMARIZED`
- `kind="state"` row: 로봇 상태 frame
- `kind="event"` row: timeline event marker
- JSON path rollup 사용
- JSON path index 사용

생성되는 주요 rollup path:

```text
$.derived.ee_speed
$.derived.ee_acceleration
$.derived.motion_energy
$.derived.anomaly_score
$.derived.path_length
$.robot.gripper
$.derived.cycle_phase
```

생성되는 주요 JSON path index:

```text
$.kind
$.event.type
$.event.severity
$.frame.id
```

## 데이터 로딩

전체 100개 episode를 로딩하는 명령입니다.

```sh
cd ~/work/neo/current/public/neo-pkg-robot-demo

~/work/neo/current/machbase-neo jsh scripts/schema.js

~/work/neo/current/machbase-neo jsh scripts/ingest.js \
  --data-root /work/data/raw/droid_lerobot \
  --dataset droid \
  --sequence droid-real-json-full \
  --min-duration-sec 999999 \
  --sample-ms 67 \
  --base-time 2026-01-01T00:00:00Z
```

이미 데이터가 들어 있는 상태에서 깨끗하게 다시 넣으려면 `PHY_ROBOT_TIMELINE`과 관련 rollup을 먼저 삭제한 뒤 위 명령을 다시 실행합니다.

## 서버 실행

```sh
cd ~/work/neo/current/public/neo-pkg-robot-demo

~/work/neo/current/machbase-neo jsh app/server.js \
  --host 127.0.0.1 \
  --port 56803
```

접속 URL:

```text
http://127.0.0.1:56803/
```

## 화면 구성

브라우저 화면은 다음 정보를 보여줍니다.

- 3D 로봇 팔 replay
- timeline slider
- play / skip controls
- 현재 frame 정보
- task / episode / gripper / end-effector speed
- Frame Query latency
- Window Query latency
- JSON path rollup chart
- event marker

`Frame Query`는 현재 timeline 위치의 frame 1개를 조회하는 시간입니다.

`Window Query`는 현재 시점 주변의 frame window를 조회하는 시간입니다.

## 주요 SQL

현재 frame 조회:

```sql
SELECT time, value, dataset, sequence, episode_id
FROM PHY_ROBOT_TIMELINE
WHERE dataset = ?
  AND sequence = ?
  AND value->'$.kind' = 'state'
  AND time BETWEEN ? AND ?
ORDER BY time DESC
LIMIT 1;
```

화면에서는 뒤쪽으로 갈수록 느려지지 않도록 frame query의 `BETWEEN` 범위를 현재 시점 직전 약 60초로 제한합니다.

주변 window 조회:

```sql
SELECT time, value, dataset, sequence, episode_id
FROM PHY_ROBOT_TIMELINE
WHERE dataset = ?
  AND sequence = ?
  AND value->'$.kind' = 'state'
  AND time BETWEEN ? AND ?
ORDER BY time
LIMIT <limit>;
```

JSON path rollup chart:

```sql
SELECT
  rollup('sec', <interval_sec>, time) AS sample_time,
  SUM(value->'<json_path>') AS sum_value,
  COUNT(value->'<json_path>') AS count_value
FROM PHY_ROBOT_TIMELINE
WHERE dataset = ?
  AND sequence = ?
  AND time BETWEEN ? AND ?
GROUP BY sample_time
ORDER BY sample_time
LIMIT <limit>;
```

event 조회:

```sql
SELECT time, value
FROM PHY_ROBOT_TIMELINE
WHERE dataset = ?
  AND sequence = ?
  AND value->'$.kind' = 'event'
  AND time BETWEEN ? AND ?
ORDER BY time
LIMIT <limit>;
```

## 주의 사항

현재 3D 로봇 팔은 실제 DROID 동영상과 완전히 일치하는 calibrated robot FK 모델이 아닙니다.

원본 데이터의 7축 motor state와 데모용 `cartesian_position`을 이용한 시각화용 렌더링입니다. 이 데모의 핵심 목적은 실제 로봇 데이터를 Machbase Neo에 저장하고, JSON TAG table과 JSON path rollup으로 빠르게 조회/분석하는 흐름을 보여주는 것입니다.

## 파일 구성

```text
lib/schema.js      테이블, rollup, index 생성
scripts/schema.js  schema 생성 실행 스크립트
scripts/ingest.js  DROID NDJSON 로딩 및 파생 metric/event 생성
lib/api.js         manifest/frame/window/signals/events API 구현
app/server.js      JSH HTTP 서버
public/app.js      Three.js 기반 브라우저 UI
```
