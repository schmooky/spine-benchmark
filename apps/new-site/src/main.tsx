import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "./app/styles/index.css";
import { App } from "./app/App";

// No StrictMode: the pixi Application has an async init + GPU resources whose
// lifecycle doesn't survive StrictMode's intentional double-mount cleanly. The
// canvas is the one imperative island in an otherwise declarative app.
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
