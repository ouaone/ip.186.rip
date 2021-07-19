import * as getFromGeoLite2 from "./utils/maxmind.js";
import maxmind from "maxmind";
import sw2express, { plugins } from "sw2express";
import ejs from "ejs";
import xml from "xml2js";
import yaml from "yaml";
import fs from "fs";
import highlight from "highlight.js";

const app = new sw2express({
  cluster: 1,
});

const getPage = async (fileName) => {
  return fs.readFileSync(`./pages/${fileName}.ejs`, {
    encoding: "utf8",
  });
};

const sendForIP = async (path, ip, req, rep) => {
  var type = "json";

  if (path.searchParams.get("ip") !== null) {
    ip = path.searchParams.get("ip");
  }

  if (path.searchParams.get("type") !== null)
    type = path.searchParams.get("type");
  else if (typeof req.headers.accept === "undefined") type = "json";
  else if (req.headers.accept.includes("text/html")) type = "html";
  else if (req.headers.accept.includes("application/json")) type = "json";
  else if (req.headers.accept.includes("text/xml")) type = "xml";
  else if (req.headers.accept.includes("text/javascript")) type = "jsonp";
  else if (req.headers.accept.includes("text/yaml")) type = "yaml";
  else if (path.pathname === "/") type = "plain";

  console.log(`${ip} ${type} ${path.pathname}`);

  try {
    const format = path.searchParams.get("format") === "true" ? 4 : 0;
    switch (type) {
      case "json":
        rep.setHeader("Content-Type", "application/json; charset=utf-8");
        rep.send(
          JSON.stringify(
            await getFromGeoLite2.getJSON(
              ip,
              path.searchParams.get("lang") || "en"
            ),
            null,
            format
          )
        );
        break;
      case "plain":
        rep.send(ip);
        break;
      case "html":
        const ipinfo = await getFromGeoLite2.getJSON(
          ip,
          path.searchParams.get("lang") || "en"
        );
        rep.setHeader("Content-type", "text/html; charset=utf-8");
        rep.send(
          await ejs.render(
            await getPage("index"),
            { ip: ip, info: ipinfo, highlight },
            { async: true }
          )
        );
        break;
      case "xml":
        rep.setHeader("Content-type", "text/xml; charset=utf-8");
        const builder = new xml.Builder();
        rep.send(
          builder.buildObject(
            await getFromGeoLite2.getJSON(
              ip,
              path.searchParams.get("lang") || "en"
            )
          )
        );
        break;
      case "jsonp":
        rep.setHeader("Content-type", "text/javascript; charset=utf-8");
        const callback = path.searchParams.get("callback") || "ip_186_rip";
        rep.send(
          `${callback}(${JSON.stringify(
            await getFromGeoLite2.getJSON(
              ip,
              path.searchParams.get("lang") || "en"
            )
          )})`
        );
        break;
      case "yaml":
        rep.setHeader("Content-type", "text/yaml; charset=utf-8");
        rep.send(
          yaml.stringify(
            await getFromGeoLite2.getJSON(
              ip,
              path.searchParams.get("lang") || "en"
            )
          )
        );
        break;
      case "rawjson":
        rep.setHeader("Content-type", "application/json; charset=utf-8");
        rep.send(
          JSON.stringify(await getFromGeoLite2.default(ip), null, format)
        );
        break;
      default:
        const info = await getFromGeoLite2.getJSON(
          ip,
          path.searchParams.get("lang") || "en"
        );
        rep.send(ip);
        rep.send(`\nASN Number: ${info.asn.number}\n`);
        rep.send(`ASN Organization: ${info.asn.organization}\n`);
        rep.send(`Location: ${info.country.name}\n`);
        break;
    }
    rep.end("\n");
  } catch (e) {
    rep.setHeader("Content-Type", "text/plain; charset=utf-8");
    console.log(e);
    rep.statusCode = 400;
    rep.end(`400 Bad Request. \n${e}`);
  }
  rep.isEnd = true;
};

app.use(async (req, rep) => {
  if (req.headers["ip"]) {
    rep.set("realip", req.headers["ip"]);
  } else if (req.headers["cf-connecting-ip"]) {
    rep.set("realip", req.headers["cf-connecting-ip"]);
  } else if (req.headers["x-forward-ip"]) {
    rep.set("realip", req.headers["x-forward-ip"]);
  } else if (req.headers["x-forwarded-for"]) {
    rep.set("realip", req.headers["x-forwarded-for"]);
  } else {
    rep.set("realip", req.req.socket.remoteAddress);
  }
  rep.headers = Object.assign(
    {
      "Cache-Control": "max-age=600, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "*",
      "Access-Control-Max-Age": "86400000",
      "Access-Control-Request-Headers": "Content-Type",
      "Access-Control-Allow-Headers":
        "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    },
    rep.headers
  );
  delete rep.headers["X-Served-By"];
  rep.headers["Server"] = `IP.186.RIP`;
});

app.extend(plugins.register);

app.use(async (req, rep) => {
  const path = new URL(req.path, "https://ip.186.rip");
  if (path.pathname === "/") {
    await sendForIP(path, rep.realip, req, rep);
  } else if (
    path.pathname.startsWith("/") &&
    maxmind.validate(path.pathname.replace("/", ""))
  ) {
    await sendForIP(path, path.pathname.replace("/", ""), req, rep);
  } else if (
    path.pathname.startsWith("/") &&
    path.pathname.split("/").length - 1 === 1
  ) {
    const method = path.pathname.replace("/", "").toLowerCase();
    const info = await getFromGeoLite2.getJSON(
      rep.realip,
      path.searchParams.get("lang") || "en"
    );
    try {
      switch (method) {
        case "ip":
          rep.send(info.ip);
          break;
        case "asn":
          rep.send(JSON.stringify(info.asn));
          break;
        case "location":
          rep.send(JSON.stringify(info.location));
          break;
        case "country":
          rep.send(JSON.stringify(info.country));
          break;
        case "prefixLength":
          rep.send(JSON.stringify(info.prefixLength));
          break;
      }
    } catch (e) {
      rep.statusCo;
      de = 404;
      rep.send("404 method not found on info.");
    }
    rep.end("\n");
  } else if (
    path.pathname.startsWith("/") &&
    path.pathname.split("/").length - 1 === 2 &&
    maxmind.validate(path.pathname.split("/")[1])
  ) {
    const method = path.pathname.split("/")[2].toLowerCase();
    const info = await getFromGeoLite2.getJSON(
      path.pathname.split("/")[1],
      path.searchParams.get("lang") || "en"
    );
    try {
      switch (method) {
        case "ip":
          rep.send(info.ip);
          break;
        case "asn":
          rep.send(JSON.stringify(info.asn));
          break;
        case "location":
          rep.send(JSON.stringify(info.location));
          break;
        case "country":
          rep.send(JSON.stringify(info.country));
          break;
        case "prefixLength":
          rep.send(JSON.stringify(info.prefixLength));
          break;
      }
    } catch (e) {
      rep.statusCo;
      de = 404;
      rep.send("404 method not found on info.");
    }
    rep.end("\n");
  }
});
app.listen(process.env.PORT || 8080);
