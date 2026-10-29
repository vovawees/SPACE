import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/lora";
import "@fontsource-variable/caveat";
// шрифты для узлов (1.3): файлы грузятся, только когда шрифт где-то выбран
import "@fontsource-variable/nunito";
import "@fontsource-variable/montserrat";
import "@fontsource-variable/comfortaa";
import "@fontsource-variable/oswald";
import "@fontsource-variable/unbounded";
import "@fontsource-variable/exo-2";
import "@fontsource-variable/pixelify-sans";
import "@fontsource-variable/playfair-display";
import "@fontsource-variable/roboto-slab";
import "@fontsource/pt-serif/400.css";
import "@fontsource/pt-serif/700.css";
import "@fontsource/pt-serif/400-italic.css";
import "@fontsource/russo-one";
import "@fontsource/ruslan-display";
import "@fontsource/marck-script";
import "@fontsource/neucha";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/ui.css";
import { mount } from "svelte";
import App from "./App.svelte";

mount(App, { target: document.getElementById("app")! });
