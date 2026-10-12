export const mobileWebCss = `
  html,
  body {
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
  }

  body {
    font-size: 16px;
  }

  .site-shell {
    width: 100%;
    max-width: 100%;
    padding: 0 0 28px;
  }

  .site-header {
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 14px;
    padding: 16px;
    border-left: 0;
    border-right: 0;
    border-radius: 0;
  }

  .brand-lockup {
    display: none;
  }

  h1 {
    font-size: clamp(2rem, 10vw, 2.75rem);
  }

  .header-copy {
    margin-top: 8px;
    font-size: 0.95rem;
  }

  .top-nav {
    display: none;
  }

  #app {
    width: 100%;
    padding: 12px;
  }

  .manual-detail-page,
  .wide-manual-page,
  .vfvt-page,
  .page-columns {
    display: block !important;
    width: 100% !important;
    min-width: 0 !important;
  }

  .manual-detail-page > .sidebar-stack {
    display: none !important;
  }

  .manual-detail-page > .page-stack,
  .manual-detail-page .anaphylaxis-sheet,
  .manual-detail-page .vfvt-case-wrap,
  .manual-detail-page .page-stack > * {
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  .anaphylaxis-grid,
  .anaphylaxis-critical-body,
  .arrest-critical-grid,
  .pals-treatment-grid,
  .embolism-layout,
  .embolism-types,
  .hypercapnia-layout,
  .hyper-flow-branches,
  .hypotension-layout,
  .hypoxia-flow,
  .hypoxia-branch-grid,
  .last-layout,
  .last-dose-stack,
  .mh-layout,
  .mh-differential-grid,
  .spinal-layout,
  .spinal-differential,
  .postop-layout,
  .postop-side,
  .postop-diff-grid,
  .mental-layout,
  .mental-right-stack,
  .mental-reversible-grid,
  .power-flow-grid,
  .power-responses,
  .generator-responses,
  .oxygen-branches,
  .oxygen-subbranches,
  .violence-grid,
  .mh-transfer-grid,
  .fire-flow-grid,
  .fire-split {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  .anaphylaxis-main,
  .anaphylaxis-side,
  .section-card,
  .anaphylaxis-critical,
  .drug-table,
  .drug-row,
  .arrest-row,
  .pals-brady-dose-row,
  .manual-label-row,
  .mh-dose-row,
  .spinal-dose-row,
  .tachy-energy-table,
  .cied-support-table,
  .violence-table {
    min-width: 0 !important;
    max-width: 100% !important;
  }

  .drug-row,
  .anaphylaxis-sheet .drug-row,
  .pals-brady-dose-row,
  .arrest-row,
  .manual-label-row,
  .mh-dose-row,
  .spinal-dose-row {
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 4px !important;
  }

  .drug-label,
  .anaphylaxis-sheet .drug-label {
    white-space: normal !important;
  }

  .drug-value,
  .manual-case-link,
  .section-body,
  .anaphylaxis-critical-col,
  .arrest-row > *,
  .pals-brady-dose-row > * {
    min-width: 0;
    overflow-wrap: break-word;
    word-break: normal;
  }

  .arrest-critical-grid > div + div,
  .two-column-reference > div + div {
    border-left: 0;
    border-top: 1px solid #aeb8c5;
  }

  .two-column-reference {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  .pals-brady-or,
  .pals-brady-indent,
  .mh-transfer-indent {
    margin-left: 0 !important;
  }

  .section-header,
  .anaphylaxis-critical-header {
    overflow-wrap: break-word;
  }

  .section-body,
  .anaphylaxis-critical-col,
  .arrest-critical-grid > div,
  .fire-node,
  .fire-final-node {
    padding-left: 12px;
    padding-right: 12px;
  }

  .protocol-grid,
  .category-grid {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  .site-footer {
    margin: 18px 12px 0;
    padding: 18px;
  }
`;
