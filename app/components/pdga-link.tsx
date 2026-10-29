// A small "PDGA ↗" link to a player's or event's page on pdga.com.
export function PdgaLink({ href, label }: { href: string | null; label: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} on pdga.com`}
      className="ml-2 text-xs font-normal text-zinc-500 hover:text-[#00628F] hover:underline dark:hover:text-[#009E91]"
    >
      PDGA ↗
    </a>
  );
}
