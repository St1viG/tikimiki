/**
 * Search route (`/search`). Server component owns the page <title>; all
 * interactivity lives in <SearchClient/>.
 *
 * Autor: Stevan Gnjato (2023/0141)
 */
import type { Metadata } from "next";
import "./search.css";
import { SearchClient } from "./SearchClient";

export const metadata: Metadata = {
  title: "tikimiki: pretraga",
  description: "Search users, organizations and hackathons.",
};

export default function SearchPage() {
  return <SearchClient />;
}
