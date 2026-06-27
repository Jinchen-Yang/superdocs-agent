const Blob = ({ color, left, top, delay }: { color: string; left: string; top: string; delay: string }) => (
  <div
    aria-hidden
    className="pointer-events-none fixed -z-10 rounded-full"
    style={{
      left,
      top,
      width: '46vh',
      height: '46vh',
      background: color,
      filter: 'blur(72px)',
      opacity: 0.5,
      animation: `blobDrift 18s ease-in-out ${delay} infinite`,
    }}
  />
);

export function Background() {
  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10" style={{ background: 'var(--root-bg)', transition: 'background .5s ease' }} />
      <Blob color="var(--blob1)" left="-6%" top="-10%" delay="0s" />
      <Blob color="var(--blob2)" left="58%" top="-14%" delay="-6s" />
      <Blob color="var(--blob3)" left="20%" top="58%" delay="-12s" />
    </>
  );
}
