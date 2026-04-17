import type { EnemyPlayerInfo, FullPlayerInfo } from "../../../../shared/schema";

function renderName(name: string, isBot: boolean): string {
  return isBot
    ? `${name} <span style="color:#88aacc;font-size:10px;">BOT</span>`
    : name;
}

export function buildScoreboardHtml(own: FullPlayerInfo[], enemy: EnemyPlayerInfo[]): string {
  const header = (cols: string[]) =>
    `<tr style="color:#88aacc;border-bottom:1px solid #334;">${cols.map((col) => `<th style="padding:2px 10px;text-align:left;">${col}</th>`).join("")}</tr>`;

  const ownRows = own.map((player) =>
    `<tr>
      <td style="padding:2px 10px;">${renderName(player.name, player.isBot)}</td>
      <td style="padding:2px 10px;color:${player.frozen ? "#ff5555" : "#55ff55"}">${player.frozen ? "FROZEN" : "ACTIVE"}</td>
      <td style="padding:2px 10px;">${player.kills}</td>
      <td style="padding:2px 10px;">${player.deaths}</td>
      <td style="padding:2px 10px;">${player.ping}ms</td>
    </tr>`
  ).join("");

  const enemyRows = enemy.map((player) =>
    `<tr>
      <td style="padding:2px 10px;">${renderName(player.name, player.isBot)}</td>
      <td style="padding:2px 10px;">-</td>
      <td style="padding:2px 10px;">${player.kills}</td>
      <td style="padding:2px 10px;">${player.deaths}</td>
      <td style="padding:2px 10px;">${player.ping}ms</td>
    </tr>`
  ).join("");

  return `<table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr><th colspan="5" style="color:#00ffff;font-size:14px;padding:4px 10px;text-align:left;">OWN TEAM</th></tr>
      ${header(["Name", "Status", "K", "D", "Ping"])}
    </thead>
    <tbody>${ownRows}</tbody>
    <thead>
      <tr><th colspan="5" style="color:#ff55ff;font-size:14px;padding:8px 10px 4px;text-align:left;">ENEMY TEAM</th></tr>
      ${header(["Name", "", "K", "D", "Ping"])}
    </thead>
    <tbody>${enemyRows}</tbody>
  </table>`;
}
