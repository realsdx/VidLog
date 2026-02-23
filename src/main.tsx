/* @refresh reload */
import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";
import { lazy } from "solid-js";
import App from "./App";
import "./styles/app.css";

// Eager load the Record route (it's the default/home page)
import Record from "./routes/Record";

// Lazy load other routes
const Library = lazy(() => import("./routes/Library"));
const Settings = lazy(() => import("./routes/Settings"));

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

render(
  () => (
    <Router root={App}>
      <Route path="/" component={Record} />
      <Route path="/library" component={Library} />
      <Route path="/settings" component={Settings} />
    </Router>
  ),
  root,
);
