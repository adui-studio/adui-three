/** Application adapters preserve the native nodes borrowed by scene controllers. */
export interface NativeBitsControl {
  update(): void;
  destroy(): void;
}
