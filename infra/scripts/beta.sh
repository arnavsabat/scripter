#!/usr/bin/env bash
# The beta's servers on demand (D-096, D-097). Run through `pnpm --filter @wr/infra beta:up` or
# `beta:down`, with your AWS profile set.
#   up:   starts Postgres and waits for it, then deploys WrApp with the load balancer and two tasks
#         (the tasks migrate and connect on start, so the database must be there first).
#   down: deploys WrApp without them (/api and /doc answer 503), then stops Postgres.
# CloudFront, the web app and the domain stay up either way. Both build and ship the web app.
set -euo pipefail
cd "$(dirname "$0")/.."
export AWS_REGION="${AWS_REGION:-us-east-2}"
mode="${1:-}"

db=$(aws cloudformation describe-stacks --stack-name WrData \
  --query "Stacks[0].Outputs[?OutputKey=='DbInstanceId'].OutputValue" --output text)
status() {
  aws rds describe-db-instances --db-instance-identifier "$db" \
    --query 'DBInstances[0].DBInstanceStatus' --output text
}
build() { VITE_WR_VERSION="$(git rev-parse --short HEAD)" pnpm --filter @wr/web build; }

case "$mode" in
  up)
    if [ "$(status)" = stopped ]; then
      aws rds start-db-instance --db-instance-identifier "$db" >/dev/null
    fi
    echo "Waiting for Postgres ($db) to be available (a few minutes after a start)…"
    aws rds wait db-instance-available --db-instance-identifier "$db"
    build
    npx cdk deploy WrApp --exclusively -c servers=on
    ;;
  down)
    build
    npx cdk deploy WrApp --exclusively -c servers=off
    if [ "$(status)" = available ]; then
      aws rds stop-db-instance --db-instance-identifier "$db" >/dev/null
      echo "Postgres is stopping. AWS restarts it after 7 days; WrApp's nightly schedule stops it again."
    else
      echo "Postgres is $(status); stop it later with: aws rds stop-db-instance --db-instance-identifier $db"
    fi
    ;;
  *)
    echo "usage: beta.sh up|down" >&2
    exit 1
    ;;
esac
