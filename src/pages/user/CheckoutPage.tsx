import { Navigate, useParams } from "react-router-dom";
import { isBookingApiId } from "../../features/booking/api";
import { FormalCheckoutPage } from "./FormalCheckoutPage";

export function CheckoutPage() {
  const { serviceId } = useParams();

  return isBookingApiId(serviceId)
    ? <FormalCheckoutPage serviceId={Number(serviceId)} />
    : <Navigate replace to="/categories" />;
}
