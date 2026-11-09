import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { AI_SERVER_DOWN_MESSAGE, userFacingAiErrorMessage } from "./ai-error-message";

describe("userFacingAiErrorMessage", () => {
  it("maps unavailable ApiError to Server is down", () => {
    expect(
      userFacingAiErrorMessage(
        new ApiError("The AI service is temporarily unavailable.", 503, {
          error_code: "unavailable",
        }),
      ),
    ).toBe(AI_SERVER_DOWN_MESSAGE);
  });

  it("maps network failures to Server is down when online", () => {
    expect(userFacingAiErrorMessage(new TypeError("Failed to fetch"))).toBe(
      AI_SERVER_DOWN_MESSAGE,
    );
  });

  it("keeps auth/config messages", () => {
    expect(
      userFacingAiErrorMessage(
        new ApiError("AI provider credentials are invalid. Contact your administrator.", 401, {
          error_code: "invalid_api_key",
        }),
      ),
    ).toBe("AI provider credentials are invalid. Contact your administrator.");
  });
});
