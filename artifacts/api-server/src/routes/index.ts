import { Router, type IRouter } from "express";
import healthRouter from "./health";
import cardsRouter from "./cards";
import listingsRouter from "./listings";
import ebayRouter from "./ebay";

const router: IRouter = Router();

router.use(healthRouter);
router.use(cardsRouter);
router.use(listingsRouter);
router.use("/ebay", ebayRouter);

export default router;
