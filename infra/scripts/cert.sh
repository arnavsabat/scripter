#!/usr/bin/env bash
# The domain's certificate (D-099). CloudFront and Cognito's custom sign-in domain take certificates
# only from us-east-1, and the AWS free plan's policy allows ACM there but not CloudFormation, so
# this script makes it instead of a stack. It requests (or finds) the certificate for <domain> and
# auth.<domain>, writes ACM's DNS check records into the domain's Route 53 zone, waits until it's
# issued, and prints the line for infra/.env.local. Safe to run again. ACM renews the certificate
# by itself as long as the check records stay in the zone.
# Run through `pnpm --filter @wr/infra cert`, with your AWS profile set.
set -euo pipefail
cd "$(dirname "$0")/.."

setting() { # from the environment, else infra/.env.local
  local v="${!1:-}"
  [ -n "$v" ] || v=$(grep -E "^$1=" .env.local 2>/dev/null | tail -1 | cut -d= -f2-)
  echo "$v"
}
domain=$(setting WR_DOMAIN)
zone=$(setting WR_HOSTED_ZONE_ID)
if [ -z "$domain" ] || [ -z "$zone" ]; then
  echo "Set WR_DOMAIN and WR_HOSTED_ZONE_ID in infra/.env.local first (runbook Part 1)." >&2
  exit 1
fi
acm() { aws acm "$@" --region us-east-1; }

arn=$(acm list-certificates --certificate-statuses PENDING_VALIDATION ISSUED \
  --query "CertificateSummaryList[?DomainName=='$domain'].CertificateArn | [0]" --output text)
if [ -z "$arn" ] || [ "$arn" = None ]; then
  arn=$(acm request-certificate --domain-name "$domain" --subject-alternative-names "auth.$domain" \
    --validation-method DNS --query CertificateArn --output text)
  echo "Requested $arn"
else
  echo "Found $arn"
fi

# ACM fills in its check records a few seconds after the request.
records=""
for _ in $(seq 1 30); do
  records=$(acm describe-certificate --certificate-arn "$arn" \
    --query 'Certificate.DomainValidationOptions[].ResourceRecord.[Name,Value]' --output text)
  if [ -n "$records" ] && ! grep -q None <<<"$records"; then break; fi
  sleep 2
done
changes=$(sort -u <<<"$records" | awk '{ printf "%s{\"Action\":\"UPSERT\",\"ResourceRecordSet\":{\"Name\":\"%s\",\"Type\":\"CNAME\",\"TTL\":300,\"ResourceRecords\":[{\"Value\":\"%s\"}]}}", (NR > 1 ? "," : ""), $1, $2 }')
aws route53 change-resource-record-sets --hosted-zone-id "$zone" \
  --change-batch "{\"Comment\":\"ACM DNS validation (D-099)\",\"Changes\":[$changes]}" >/dev/null
echo "Check records written to Route 53. Waiting for ACM to issue the certificate (usually a few minutes)…"
acm wait certificate-validated --certificate-arn "$arn"
echo "Issued. Put this in infra/.env.local:"
echo "WR_CERTIFICATE_ARN=$arn"
