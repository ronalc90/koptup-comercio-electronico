import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { homeRouteForRole } from "@/lib/permissions";

export default async function Home() {
  const session = await getSession();
  if (session) {
    // Inicio según rol: admin/superadmin NO operan el negocio, así que no deben
    // aterrizar en /dashboard (provocaba un parpadeo y un rebote en el cliente).
    redirect(homeRouteForRole(session.role));
  }
  redirect("/login");
}
