import { describe, expect, it, vi } from "vitest";
import { downloadCsvExport } from "./downloadCsvExport";

describe("downloadCsvExport", () => {
  it("downloads the API CSV envelope with filename, content type, and BOM", () => {
    const createdBlobs: Array<{ parts: BlobPart[]; options?: BlobPropertyBag }> = [];
    const click = vi.fn();
    const remove = vi.fn();
    const anchor = {
      click,
      download: "",
      href: "",
      remove,
      style: {} as CSSStyleDeclaration
    } as unknown as HTMLAnchorElement;
    const documentStub = {
      body: {
        appendChild: vi.fn()
      },
      createElement: vi.fn(() => anchor)
    } as unknown as Document;
    class FakeBlob {
      public constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        createdBlobs.push({ parts, options });
      }
    }
    const url = {
      createObjectURL: vi.fn(() => "blob:payroll-export"),
      revokeObjectURL: vi.fn()
    };

    const downloaded = downloadCsvExport(
      {
        filename: "payroll.csv",
        contentType: "text/csv; charset=utf-8",
        csv: "shop_name,total\nGINZA,12960"
      },
      {
        BlobCtor: FakeBlob as unknown as typeof Blob,
        document: documentStub,
        url
      }
    );

    expect(downloaded).toBe(true);
    expect(createdBlobs).toEqual([
      {
        parts: ["\uFEFFshop_name,total\nGINZA,12960"],
        options: { type: "text/csv; charset=utf-8" }
      }
    ]);
    expect(anchor.href).toBe("blob:payroll-export");
    expect(anchor.download).toBe("payroll.csv");
    expect(documentStub.body.appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(url.revokeObjectURL).toHaveBeenCalledWith("blob:payroll-export");
  });

  it("does not throw when called outside a browser document", () => {
    expect(
      downloadCsvExport({
        filename: "empty.csv",
        contentType: "text/csv; charset=utf-8",
        csv: "header"
      })
    ).toBe(false);
  });

  it("accepts the settlement export envelope content field", () => {
    const createdBlobs: Array<{ parts: BlobPart[]; options?: BlobPropertyBag }> = [];
    const anchor = {
      click: vi.fn(),
      download: "",
      href: "",
      remove: vi.fn(),
      style: {} as CSSStyleDeclaration
    } as unknown as HTMLAnchorElement;
    const documentStub = {
      body: {
        appendChild: vi.fn()
      },
      createElement: vi.fn(() => anchor)
    } as unknown as Document;
    class FakeBlob {
      public constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        createdBlobs.push({ parts, options });
      }
    }

    downloadCsvExport(
      {
        filename: "settlements.csv",
        contentType: "text/csv; charset=utf-8",
        content: "order_no,status\nBK-1,complete"
      },
      {
        BlobCtor: FakeBlob as unknown as typeof Blob,
        document: documentStub,
        url: {
          createObjectURL: vi.fn(() => "blob:settlements"),
          revokeObjectURL: vi.fn()
        }
      }
    );

    expect(createdBlobs[0]?.parts).toEqual(["\uFEFForder_no,status\nBK-1,complete"]);
  });
});
