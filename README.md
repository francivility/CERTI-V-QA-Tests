# CERTI-V QA Tests

Automated QA tests for the Certi-V LTFRB Region V system, written with [Grafana k6](https://k6.io/).

## Prerequisites

- k6 installed (`winget install k6 --source winget`)
- Certi-V backend running (default `http://localhost:8000`) with all migrations applied (`python manage.py migrate`) and reference data seeded
- A test applicant account in the database
- One staff account per TMS role (`python manage.py create_user --username officer1 --password Testpass123 --role "Receiving Officer"`, and so on)

## Setup

Pass credentials as environment variables:

```sh
k6 run -e APPLICANT_USER=testapplicant -e APPLICANT_PASS='Testpass123!' applicant-02-login.js
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `BASE_URL` | `http://localhost:8000` | Backend host; routes are called under `/api` |
| `APPLICANT_USER` | `testapplicant` | Test applicant username |
| `APPLICANT_PASS` | `Testpass123!` | Test applicant password |
| `PEAK_VUS` | `20` | Peak virtual users for the ramped scripts |
| `RESUBMIT_APP_ID` | unset | Application id for a real resubmit in applicant script 04 (changes that application's status) |
| `STAFF_PASS` | `Testpass123` | Password shared by the staff test accounts |
| `STAFF_RECEIVING_USER` | `officer1` | Receiving Officer |
| `STAFF_CTDO_USER` | `ctdouser` | CTDO |
| `STAFF_ANALYST_USER` | `analyst1` | Financial Analyst |
| `STAFF_CASHIER_USER` | `cashier1` | Cashier |
| `STAFF_LEGAL_USER` | `legal1` | Legal Officer |
| `STAFF_ORD_USER` | `orduser` | ORD |
| `STAFF_RECORDS_USER` | `records1` | Records Officer |
| `MUTATE` | unset | Set to `1` to let staff workflow POSTs act on real queue items |

## Applicant suite

| Script | Covers | Load |
| --- | --- | --- |
| `applicant-01-register.js` | Registration steps, email verification, status polling, abandon | Ramp to 20 VUs, 35s |
| `applicant-02-login.js` | Login, account, preferences, username/password change, token refresh, delete, Google | Ramp to 20 VUs, 35s |
| `applicant-03-qr-bridge.js` | Verification session and QR bridge upload/poll/download/consume | Ramp to 20 VUs, 35s |
| `applicant-04-application.js` | Reference data, drafts, documents, finalize, petition and operator sheet | Ramp to 20 VUs, 35s |
| `applicant-05-payments.js` | Bills, payment method, Xendit, receipts, notifications, CPC, hearing notice | Ramp to 20 VUs, 35s |
| `applicant-06-load.js` | Repeated hits on read-heavy routes | 10 VUs, 30s |

Every script fails its run (exit code 99) when p95 latency reaches 1500 ms or more than 5% of requests return an unexpected status.

The scripts are safe to repeat against a shared test account: registrations are abandoned, drafts and bridge uploads are removed, and `change-password` / `delete-account` are sent with a wrong password so the account survives. Script 05 does write to the test applicant's data when an application is awaiting payment (payment method, status log, Xendit invoice).

## TMS (staff) suite

| Script | Role | Covers | Load |
| --- | --- | --- | --- |
| `staff-01-login.js` | CTDO | Staff login, Google, token refresh, account, password reset, e-signature | Ramp to 20 VUs, 35s |
| `staff-02-receiving.js` | Receiving Officer | Queue, detail, document review, forward to CTDO, history, reports, case search | Ramp to 20 VUs, 35s |
| `staff-03-ctdo.js` | CTDO | Queue, flag/unflag, decision, history, reports | Ramp to 20 VUs, 35s |
| `staff-04-assessment.js` | Financial Analyst | Queue, fees, SOA, Payment Order Slip, history, reports, overdue | Ramp to 20 VUs, 35s |
| `staff-05-cashier.js` | Cashier | Queue, receive payment, receipt, history, reports | Ramp to 20 VUs, 35s |
| `staff-06-docket.js` | Financial Analyst | Paid queue, docket generation | Ramp to 20 VUs, 35s |
| `staff-07-legal.js` | Legal Officer | Hearing slots, scheduling, notice, decision drafting, signature upload | Ramp to 20 VUs, 35s |
| `staff-08-approval.js` | CTDO and ORD | Endorsement, approval, signatures, ORD reports | Ramp to 20 VUs, 35s |
| `staff-09-records.js` | Records Officer | Release queue, release, history, expiry monitor, summary | Ramp to 20 VUs, 35s |
| `staff-10-load.js` | All seven | Staff login plus each role's dashboard queue | 10 VUs, 30s |

Staff workflow POSTs (forward, decide, issue, pay, schedule, sign, release) are one-way transitions on real applications. By default they are sent to id 0, which exercises the route, authentication and validation without moving any case. Run with `-e MUTATE=1` against disposable data to drive real queue items through the transitions under load.

`staff-01-login.js` uses up the per-IP rate limits on staff Google sign-in and password reset (5 and 10 per hour) for the hour after a run.

## Reports

`report-applicant-*.txt` and `report-staff-*.txt` hold the result of the latest run of each script: per-endpoint status codes and latency, the k6 summary, the failure narrative and the root-cause analysis.
