import type { ConnectRouter } from "@connectrpc/connect";
import { MapService } from "@/gen/meshexplorer/v1/map_pb";
import { NeighborsService } from "@/gen/meshexplorer/v1/neighbors_pb";
import { NodeService } from "@/gen/meshexplorer/v1/node_pb";
import { StatsService } from "@/gen/meshexplorer/v1/stats_pb";
import { ChatService } from "@/gen/meshexplorer/v1/chat_pb";
import { PacketsService } from "@/gen/meshexplorer/v1/packets_pb";
import { RegionsService } from "@/gen/meshexplorer/v1/regions_pb";
import { mapServiceImpl } from "./map";
import { neighborsServiceImpl } from "./neighbors";
import { nodeServiceImpl } from "./node";
import { statsServiceImpl } from "./stats";
import { chatServiceImpl } from "./chat";
import { packetsServiceImpl } from "./packets";
import { regionsServiceImpl } from "./regions";

export default function routes(router: ConnectRouter) {
  router.service(MapService, mapServiceImpl);
  router.service(NeighborsService, neighborsServiceImpl);
  router.service(NodeService, nodeServiceImpl);
  router.service(StatsService, statsServiceImpl);
  router.service(ChatService, chatServiceImpl);
  router.service(PacketsService, packetsServiceImpl);
  router.service(RegionsService, regionsServiceImpl);
}
