import { createRoot } from "react-dom/client";
import { useState } from "react";
import App from "./App";
import Experience from "./demo/Experience";
import "./style.css";
function Root() {
  const [workbench, setWorkbench] = useState(location.hash === "#workbench");
  return workbench ? (
    <App
      onDemo={() => {
        history.replaceState(null, "", "#demo");
        setWorkbench(false);
      }}
    />
  ) : (
    <Experience
      onWorkbench={() => {
        history.replaceState(null, "", "#workbench");
        setWorkbench(true);
      }}
    />
  );
}
createRoot(document.getElementById("root")!).render(<Root />);
