import DefaultTheme from "vitepress/theme-without-fonts";
import type { Theme } from "vitepress";
import MotionLayout from "./MotionLayout.ts";
import "../../../../ui/tokens.css";
import "../../../../ui/vue-bits/spotlight-card.css";
import "../../../../ui/vue-bits/motion-components.css";
import "./custom.css";
import "../../../../ui/tech.css";
export default {
  extends: DefaultTheme,
  Layout: MotionLayout,
} satisfies Theme;
