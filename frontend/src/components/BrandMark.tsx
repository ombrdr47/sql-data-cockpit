/** Shared vector mark; surrounding wordmarks/links provide the accessible name. */
export default function BrandMark({ size = 32 }: { size?: number }) {
  return <img src="/favicon.svg" alt="" aria-hidden="true" width={size} height={size} style={{ flexShrink: 0 }} />
}
