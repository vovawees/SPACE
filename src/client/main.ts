import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/lora";
import "@fontsource-variable/caveat";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/ui.css";
import { mount } from "svelte";
import App from "./App.svelte";

mount(App, { target: document.getElementById("app")! });
