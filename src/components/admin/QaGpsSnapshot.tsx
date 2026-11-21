import snapshot from "../../../tools/hardware-gps-qa/admin-preview/snapshot.html?raw";

export default function QaGpsSnapshot() {
  return <iframe title="HALLO GPS QA history" sandbox="" srcDoc={snapshot}
    style={{ display: "block", width: "100%", height: "100dvh", border: 0 }} />;
}
