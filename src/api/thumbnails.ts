import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";

type Thumbnail = {
  data: ArrayBuffer;
  mediaType: string;
};

const videoThumbnails: Map<string, Thumbnail> = new Map();

export async function handlerGetThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }

  const thumbnail = videoThumbnails.get(videoId);
  if (!thumbnail) {
    throw new NotFoundError("Thumbnail not found");
  }

  return new Response(thumbnail.data, {
    headers: {
      "Content-Type": thumbnail.mediaType,
      "Cache-Control": "no-store",
    },
  });
}

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  const formData = await req.formData();

  const thumbnail = formData.get("thumbnail");

  if (!(thumbnail instanceof File)) {
    throw new BadRequestError("Invalid thumbnail file");
  }

  const maxUploadSize = 10 * 1024 * 1024; // 10MB

  if (thumbnail.size > maxUploadSize) {
    throw new BadRequestError("Thumbnail file is too large");
  }

  const buffer = await thumbnail.arrayBuffer();
  const mediaType = thumbnail.type;

  const {
    title,
    description,
    videoURL,
    createdAt,
    updatedAt,
    userID: videoUserID,
  } = getVideo(cfg.db, videoId) ?? {};

  if (!videoUserID || videoUserID !== userID) {
    throw new UserForbiddenError(
      "You are not authorized to upload a thumbnail for this video"
    );
  }

  //  save thumbnail to global map
  videoThumbnails.set(videoId, {
    data: buffer,
    mediaType,
  });

  const newThumbnailURL = `http://localhost:${cfg.port}/api/thumbnails/${videoId}`;

  const newVideo = {
    id: videoId,
    createdAt: createdAt ?? new Date(),
    updatedAt: updatedAt ?? new Date(),
    title: title ?? "",
    description: description ?? "",
    thumbnailURL: newThumbnailURL,
    userID,
  };

  updateVideo(cfg.db, newVideo);

  return respondWithJSON(200, newVideo);
}
