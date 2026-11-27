# Multi-brand hardware QA

This branch stacks on PR #528 for the QA-only registration runner, normalization, SQLite replay, and staging exporter. PR #529 supplies historical live read-only access evidence. PR #530 depends on #529 and separately validates the HALLO truck/plate view. Neither branch is merged here. Keep the QA schema private and its writer disabled outside an approved test.

## Protocol evidence

- The Cantrack manufacturer associates C32 with SecumorePlus. Its C32 manual describes 2G GPRS over TCP/IP and APN and server commands. TCP/IP identifies transport only. Compare the purchased unit’s SKU and firmware to the manual before configuration. [Manufacturer FAQ](https://www.cantrackgps.com/faq/list_92_2/) · [Cantrack C32 manual](https://www.kinghelm.net/upload/file/20240529/C32%20USER%20MANUAL.pdf)
- Traccar lists **Cantrack C32** as **GT06**, default listener **5023**, and lists **Secumore G05** separately as **H02**, default listener **5013**. Separate protocol decoders exist in the deployed version 6.17.0. This is model-level evidence for a GT06 candidate. The purchased unit has no observed packet or fix yet. [Device catalog](https://www.traccar.org/devices/) · [GT06 source](https://github.com/traccar/traccar/blob/v6.17.0/src/main/java/org/traccar/protocol/Gt06ProtocolDecoder.java) · [H02 source](https://github.com/traccar/traccar/blob/v6.17.0/src/main/java/org/traccar/protocol/H02ProtocolDecoder.java)
- Preserve the existing ST-906L H02 configuration. Use the established Railway Traccar QA service and HALLO GPS QA Supabase project rmnjhdlbhfcmlvzqtblm. The existing H02 proxy targets 5013. Confirm a distinct QA TCP route to the verified GT06 listener before configuring a C32. The Railway assigned external port can differ from 5023.

## Owner-controlled registration and mapping

Use the existing runner and private HALLO_GPS_MAPPINGS_FILE. Keep identifiers as strings. Replace examples with identifiers reported by the devices and QA-only truck and plate values.

```json
[
  {"name":"QA ST-906L","uniqueId":"synthetic-st","truckId":"qa-st","model":"sinotrack-st-906l","plateNumber":"QA-ST"},
  {"name":"QA C32","uniqueId":"synthetic-c32","truckId":"qa-c32","model":"secumore-c32","plateNumber":"QA-C32"}
]
```

Use HALLO_GPS_ENV=qa and the existing run-qa.mjs register, verify and once modes. Keep the registration token and scoped reader token in the owner runner’s secret store. Authorize only the intended device set. Keep the same unique device-to-truck pairing in the protected staging mapping. The plate belongs to the QA mapping JSON. The existing database transport continues to use the device and truck keys.

Add `"verifiedProtocol":"gt06"` to the C32 mapping only after confirming the purchased unit emits GT06 and Traccar associates it with the registered identifier. With the field absent, registration works, ingestion skips the device, and the runner reports it as pending and OFFLINE. Use a fresh protected QA SQLite file when switching a device’s protocol or assignment to avoid displaying historic rows under a new configuration.

## Windows, SIM, and physical acceptance

1. Identify the model and firmware from the manual, packaging, or vendor. Keep the IMEI, SIM number, passwords and raw packets private. Use the specified fused power harness. On a stationary bench, leave optional relay outputs disconnected.
2. If the manufacturer provides a USB data interface, run `Get-PnpDevice -PresentOnly -Class Ports` before and after connection. In Device Manager check the new COM port and Hardware IDs. Use the vendor driver and serial settings. If the unit has no documented data interface, use the documented SMS diagnostics.
3. Confirm 2G service at the test site, an active SMS/data SIM, carrier APN, and PIN configuration required by the manual. For the C32 revision whose manual matches the unit, record the current parameters with `PARAM#` and check status with `STATUS#`. Use only documented APN and server commands for that revision. Confirm the public QA endpoint and whether the firmware accepts a hostname before changing server parameters.
4. In Traccar QA verify the exact device, protocol, server receipt time and a valid outdoor fix. Compare coordinates and fix time with a known location. Confirm normalized speed, heading, LIVE / STALE / OFFLINE transitions, and correct truck and plate association.
5. Interrupt and restore connectivity on the bench. Verify the tracker’s observed buffering behavior, preservation of GPS timestamps, newest fix selection and no duplicate staging rows. Exercise unauthorized device reads and write denial with a scoped reader. Any staging ingestion requires separately approved QA writer activation and cleanup.
6. Record evidence by model. Report a SIM that cannot attach, a mismatched protocol, missing valid fix, or missing replay as a hardware blocker. Automated fixtures cover the software path.
