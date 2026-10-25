import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import SharedTrip from "./components/SharedTrip.jsx";
import "./styles.css";

try {
  const saved = localStorage.getItem("theme");
  const dark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
} catch {
  document.documentElement.dataset.theme = "light";
}

const shared = window.location.pathname.match(/^\/s\/([\w-]+)/);
createRoot(document.getElementById("root")).render(shared ? <SharedTrip token={shared[1]} /> : <App />);
