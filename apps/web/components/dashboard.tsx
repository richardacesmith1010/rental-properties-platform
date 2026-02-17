import type { RentCharge } from "@rental/shared";

const upcoming: RentCharge[] = [
  { id: "1", leaseId: "L-100", dueDate: "2026-03-01", amountCents: 220000, status: "pending" },
  { id: "2", leaseId: "L-101", dueDate: "2026-03-01", amountCents: 185000, status: "pending" },
  { id: "3", leaseId: "L-102", dueDate: "2026-02-01", amountCents: 195000, status: "late" }
];

export function Dashboard() {
  return (
    <div className="grid" style={{ gap: "1.25rem" }}>
      <section>
        <h1>Rental Operations</h1>
        <p style={{ color: "var(--muted)", maxWidth: 700 }}>
          One place to track occupancy, rents, maintenance, and documents across your portfolio.
        </p>
      </section>

      <section className="grid cards">
        <article className="card">
          <h3>Monthly Gross Rent</h3>
          <p className="kpi">$6,000</p>
          <span className="badge">3 active leases</span>
        </article>
        <article className="card">
          <h3>Occupancy</h3>
          <p className="kpi">75%</p>
          <span className="badge">3 of 4 units</span>
        </article>
        <article className="card">
          <h3>Open Maintenance</h3>
          <p className="kpi">2</p>
          <span className="badge">1 high priority</span>
        </article>
        <article className="card">
          <h3>Late Rent</h3>
          <p className="kpi">$1,950</p>
          <span className="badge">1 account</span>
        </article>
      </section>

      <section className="card">
        <h2>Upcoming / Late Charges</h2>
        <div className="grid" style={{ gap: "0.75rem" }}>
          {upcoming.map((charge) => (
            <div key={charge.id} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
              <div>
                <strong>{charge.leaseId}</strong>
                <p style={{ margin: "0.2rem 0", color: "var(--muted)" }}>Due {charge.dueDate}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <strong>${(charge.amountCents / 100).toLocaleString()}</strong>
                <p style={{ margin: "0.2rem 0" }}>{charge.status.toUpperCase()}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
