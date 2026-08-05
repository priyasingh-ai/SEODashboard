import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";

export default function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description="That website or page isn't in your portfolio."
      action={
        <Button asChild size="sm">
          <Link href="/">Back to Portfolio</Link>
        </Button>
      }
    />
  );
}
