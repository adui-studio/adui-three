import DefaultTheme from "vitepress/theme-without-fonts";
import { h } from "vue";
import type { Theme } from "vitepress";
import HomePage from "./HomePage.ts";
import "../../../../ui/tokens.css";
import "./custom.css";
export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, { "home-hero-before": () => h(HomePage) }),
} satisfies Theme;
