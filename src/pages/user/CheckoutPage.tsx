import { Navigate, useParams } from "react-router-dom";
import { isBookingApiId } from "../../features/booking/api";
import { FormalCheckoutPage } from "./FormalCheckoutPage";

export function CheckoutPage() {
  const { serviceId, technicianServiceId } = useParams();

  if (isBookingApiId(technicianServiceId)) {
    return <FormalCheckoutPage catalogRef={{ id: Number(technicianServiceId), type: "technician_service" }} />;
  }
  if (isBookingApiId(serviceId)) {
    return <FormalCheckoutPage catalogRef={{ id: Number(serviceId), type: "shop_service" }} />;
  }
  return <Navigate replace to="/categories" />;
}
