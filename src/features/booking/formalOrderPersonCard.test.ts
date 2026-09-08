import { it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ClientThemeProvider } from "../../theme/ClientThemeProvider";
import { SocialProfileMiniCard } from "../../shared/profile-card";
import { buildFormalOrderPersonCard } from "./formalOrderPersonCard";
it("does not render invented KYC, levels or social numbers with the actual shared card",()=>{
 const data=buildFormalOrderPersonCard({id:7,displayName:"真实客户",avatarUrl:null,city:null,reviewSummary:{ratingAverage:"0",reviewCount:0}},"user");
 const markup=renderToStaticMarkup(createElement(ClientThemeProvider,null,createElement(MemoryRouter,null,createElement(SocialProfileMiniCard,{data,showAction:false,showLevel:false,showSocialStats:false}))));
 expect(markup).toContain("真实客户");expect(markup).not.toContain("KYC 已验证");expect(markup).not.toContain("粉丝");expect(markup).not.toContain("Lv.");
});
