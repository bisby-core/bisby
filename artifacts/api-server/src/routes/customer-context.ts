import { Router, type IRouter } from "express";
import { GetCustomerContextResponse } from "./schemas";

const router: IRouter = Router();

/** This router is mounted behind the customer-host database router. */
router.get("/customer-context", (req, res) => {
  if (!req.tenantContext) {
    res.status(500).json({ error: "customer_context_unavailable" });
    return;
  }

  res.json(
    GetCustomerContextResponse.parse({
      customerName: req.tenantContext.customerName,
      subdomain: req.tenantContext.subdomain,
    }),
  );
});

export default router;