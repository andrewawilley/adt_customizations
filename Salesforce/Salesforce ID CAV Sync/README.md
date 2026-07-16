# Salesforce ID CAV Sync

## Overview

A hybrid Lightning component that keeps the `Salesforce.salesforce_id` call variable (CAV)
in sync with the Salesforce record the agent is working on during a Five9 call.

## Hybrid design

| Capability | Source |
|---|---|
| REST-based CAV ID resolution (no active call required) | `3rdPartySetCAV.bundle.js` |
| Idempotency guard (`lastSetRecordId`) to avoid WS event 4 feedback loops | `3rdPartySetCAV.bundle.js` |
| Lightning component structure with `v.recordId` | `Related To Record Confirmation` |
| `objectSelected` / `afterScreenPop` event handling | `Related To Record Confirmation` |
| `beforeDisposition` mismatch confirmation prompt | `Related To Record Confirmation` |
| Timestamped `ConsoleLogger` class | `Related To Record Confirmation` |

## How it works

1. **`callStarted`** — The controller caches the Five9 orgId and resolves the numeric ID of
   `Salesforce.salesforce_id` via the Five9 REST API (`/call_variables` endpoint).  
   If the agent is already viewing a record (`v.recordId`), the CAV is set immediately.

2. **`objectSelected`** — When the agent changes the related-to record in the Five9 adapter
   toolbar, the CAV is updated to that record's Salesforce ID.

3. **`afterScreenPop`** — When a single-record screen pop navigates the agent to a record,
   the CAV is updated to that record's Salesforce ID.

4. **`beforeDisposition`** — If the record stored in the CAV doesn't match the record
   currently in focus (`v.recordId`), the agent sees a confirmation dialog before
   the call can be dispositioned.

5. **WS Event 4 (Interaction Updated)** — Re-asserts the CAV value as a backup.  
   The `lastSetRecordId` idempotency guard prevents a `setCav → event 4 → setCav` loop.

## Configuration

Edit the constants near the top of `salesforceIdCavSync_controller.js` if your org uses
different CAV group/name values:

```js
const TARGET_CAV_GROUP = "Salesforce";   // CAV group
const TARGET_CAV_NAME  = "salesforce_id"; // CAV name
```

The CAV **must** be on the campaign profile layout or `setCav` calls will be silently ignored.

## Deployment

1. Deploy `salesforceIdCavSync.cmp` and `salesforceIdCavSync_controller.js` as an Aura
   Lightning component in your Salesforce org.
2. Add the component to the record page layouts (Lightning App Builder) for the object types
   your agents work with.
3. Ensure the `five9_plugin_api` Static Resource is present in your org.
