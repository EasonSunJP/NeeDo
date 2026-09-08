import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { isBookingApiId } from "../../features/booking/api";
import { FormalCheckoutPage } from "./FormalCheckoutPage";
import { parseCheckoutServiceRoute } from "./formal-checkout/checkoutServiceRoute";

export function CheckoutPage() {
  const { serviceId, technicianServiceId } = useParams();
  const [searchParams] = useSearchParams();

  if (isBookingApiId(technicianServiceId)) {
    return <FormalCheckoutPage catalogRef={{ id: Number(technicianServiceId), type: "technician_service" }} />;
  }
  const route = parseCheckoutServiceRoute(serviceId, searchParams);

  if (!route) return <Navigate replace to="/categories" />;
  return route.kind === "shop"
    ? <FormalCheckoutPage catalogRef={{ id: route.serviceId, type: "shop_service" }} />
    : <FormalCheckoutPage catalogRef={{
        id: route.serviceId,
        shopId: route.shopId,
        technicianId: route.technicianId,
        type: "technician_service"
      }} />;
}
