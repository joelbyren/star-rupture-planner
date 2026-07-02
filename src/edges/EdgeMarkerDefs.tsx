/**
 * Blueprint's drafted chevron arrowhead, defined once and referenced by every
 * blueprint edge via `marker-end="url(#bp-arrow)"`. A marker only needs to
 * exist once in the document to be referenced — it doesn't have to live in
 * the same <svg> as the path that uses it.
 */
export function EdgeMarkerDefs() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
      <defs>
        <marker
          id="bp-arrow"
          markerWidth="10"
          markerHeight="9"
          refX="7.5"
          refY="4"
          orient="auto"
        >
          <path className="bp-arrow-path" d="M0,0 L8,4 L0,8 L1.6,4 Z" />
        </marker>
      </defs>
    </svg>
  );
}
