import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";

export function ClosingSection() {
  return (
    <section className="bf-container bf-closing">
      <div>
        <span className="bf-eyebrow">Your next perspective</span>
        <h2>Start with a structure.<br />See where your questions lead.</h2>
      </div>
      <Link className="bf-button" to="/signup">
        Create account <ArrowUpRight size={18} aria-hidden="true" />
      </Link>
    </section>
  );
}
