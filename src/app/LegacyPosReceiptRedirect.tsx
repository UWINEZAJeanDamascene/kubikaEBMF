import { Navigate, useLocation, useParams } from "react-router";

export default function LegacyPosReceiptRedirect() {
  const { invoiceId } = useParams();
  const location = useLocation();

  return (
    <Navigate
      to={{
        pathname: `/pos/till/receipt/${encodeURIComponent(invoiceId || "")}`,
        search: location.search,
        hash: location.hash,
      }}
      replace
    />
  );
}
