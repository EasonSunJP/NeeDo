import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { FormalCheckoutPage } from "./FormalCheckoutPage";
import { parseCheckoutServiceRoute } from "./formal-checkout/checkoutServiceRoute";

export function CheckoutPage() {
  const { serviceId } = useParams();
  const [searchParams] = useSearchParams();
  const route = parseCheckoutServiceRoute(serviceId, searchParams);

  if (!route) return <Navigate replace to="/categories" />;
  return route.kind === "shop"
    ? <FormalCheckoutPage serviceId={route.serviceId} />
    : <FormalCheckoutPage
        shopId={route.shopId}
        technicianId={route.technicianId}
        technicianServiceId={route.serviceId}
      />;
}
