import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const code = "e97bbef71df9bd695968cc27fdba8cf80785ceae";

const auth = Buffer.from(
  `${process.env.BLING_CLIENT_ID}:${process.env.BLING_CLIENT_SECRET}`
).toString("base64");

const run = async () => {
  const r = await axios.post(
    "https://www.bling.com.br/Api/v3/oauth/token",
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: "http://localhost"
    }),
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );

  console.log("ACCESS:", r.data.access_token);
  console.log("REFRESH:", r.data.refresh_token);
};

run();
