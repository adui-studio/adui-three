import DefaultTheme from "vitepress/theme-without-fonts";
import type { Theme } from "vitepress";
import MotionLayout from "./MotionLayout.ts";
import "../../../../ui/tokens.css";
import "./custom.css";
export default {
  extends: DefaultTheme,
  Layout: MotionLayout,
} satisfies Theme;
