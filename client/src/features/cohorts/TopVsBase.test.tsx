import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TopVsBase } from "./TopVsBase";

describe("F-1.6 TopVsBase", () => {
  it("renders the MODEL v2 topo_vs_base shape", () => {
    render(
      <TopVsBase
        baseline={{
          topo_vs_base: {
            p90_vs_p10: {
              n_top: 8,
              n_base: 9,
              d_orders: 4.5,
              d_connection: 0.12,
              d_quality: 0.2,
              d_cancel: -0.03,
            },
          },
        }}
      />,
    );

    expect(screen.getByText("Delta orders")).toBeInTheDocument();
    expect(screen.getByText("4.5")).toBeInTheDocument();
  });

  it("keeps NULL/suppressed baselines conservative", () => {
    render(<TopVsBase baseline={null} />);
    expect(screen.getByText(/No baseline computed/i)).toBeInTheDocument();
  });
});
