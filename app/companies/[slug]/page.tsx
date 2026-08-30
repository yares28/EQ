import { CompanyProfile } from "./company-profile";

export default async function CompanyProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <CompanyProfile slug={slug} />;
}
