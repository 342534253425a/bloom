package online.bloomlove.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.webrtc.DataChannel;
import org.webrtc.DefaultVideoDecoderFactory;
import org.webrtc.DefaultVideoEncoderFactory;
import org.webrtc.EglBase;
import org.webrtc.IceCandidate;
import org.webrtc.MediaConstraints;
import org.webrtc.MediaStream;
import org.webrtc.PeerConnection;
import org.webrtc.PeerConnectionFactory;
import org.webrtc.RtpReceiver;
import org.webrtc.ScreenCapturerAndroid;
import org.webrtc.SdpObserver;
import org.webrtc.SessionDescription;
import org.webrtc.SurfaceTextureHelper;
import org.webrtc.VideoSource;
import org.webrtc.VideoTrack;

import java.util.ArrayList;
import java.util.Collections;

/**
 * Screen sharing for the Android app. The WebView has no getDisplayMedia, so the screen is captured natively
 * (MediaProjection) and handed to the page over a WebRTC connection inside the phone. The page then gets an
 * ordinary video track and uses it in calls and the cinema exactly like a computer's screen.
 */
@CapacitorPlugin(name = "BloomScreen")
public class ScreenSharePlugin extends Plugin {
    private static PeerConnectionFactory factory;
    private static EglBase egl;

    private final Handler main = new Handler(Looper.getMainLooper());
    private ScreenCapturerAndroid capturer;
    private SurfaceTextureHelper helper;
    private VideoSource source;
    private VideoTrack track;
    private PeerConnection pc;
    private PluginCall pending;
    private boolean offered;

    @PluginMethod
    public void start(PluginCall call) {
        cleanup(false);
        MediaProjectionManager manager = (MediaProjectionManager) getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        startActivityForResult(call, manager.createScreenCaptureIntent(), "onPermission");
    }

    @ActivityCallback
    private void onPermission(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("denied");
            return;
        }
        final Intent data = result.getData();
        // Android 10+ allows capturing only from a foreground service of the "mediaProjection" type.
        ScreenShareService.onReady = () -> main.post(() -> begin(call, data));
        ContextCompat.startForegroundService(getContext(), new Intent(getContext(), ScreenShareService.class));
    }

    private void begin(PluginCall call, Intent data) {
        try {
            Context context = getContext().getApplicationContext();
            if (factory == null) {
                PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context).createInitializationOptions());
                egl = EglBase.create();
                factory = PeerConnectionFactory.builder()
                    .setVideoEncoderFactory(new DefaultVideoEncoderFactory(egl.getEglBaseContext(), true, true))
                    .setVideoDecoderFactory(new DefaultVideoDecoderFactory(egl.getEglBaseContext()))
                    .createPeerConnectionFactory();
            }

            int maxSize = call.getInt("maxSize", 1280);
            int fps = call.getInt("fps", 30);
            DisplayMetrics metrics = context.getResources().getDisplayMetrics();
            int w = metrics.widthPixels;
            int h = metrics.heightPixels;
            float scale = Math.min(1f, (float) maxSize / Math.max(w, h));
            w = Math.round(w * scale / 2) * 2;
            h = Math.round(h * scale / 2) * 2;

            source = factory.createVideoSource(true);
            helper = SurfaceTextureHelper.create("BloomScreen", egl.getEglBaseContext());
            capturer = new ScreenCapturerAndroid(data, new MediaProjection.Callback() {
                @Override
                public void onStop() {
                    // Stopped from the system (status bar chip, notification, locked screen).
                    main.post(() -> {
                        if (capturer != null) {
                            notifyListeners("ended", new JSObject());
                            cleanup(true);
                        }
                    });
                }
            });
            capturer.initialize(helper, context, source.getCapturerObserver());
            capturer.startCapture(w, h, fps);
            track = factory.createVideoTrack("bloom-screen", source);

            PeerConnection.RTCConfiguration config = new PeerConnection.RTCConfiguration(new ArrayList<>());
            config.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN;
            config.continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_ONCE;
            pending = call;
            offered = false;
            pc = factory.createPeerConnection(config, new Observer());
            if (pc == null) throw new IllegalStateException("no peer connection");
            pc.addTrack(track, Collections.singletonList("bloom-screen"));
            pc.createOffer(new Sdp() {
                @Override
                public void onCreateSuccess(SessionDescription offer) {
                    pc.setLocalDescription(new Sdp() {
                        @Override
                        public void onSetSuccess() {
                            // The local candidates are found almost at once; send the offer when they are (or soon anyway).
                            main.postDelayed(ScreenSharePlugin.this::sendOffer, 2500);
                        }
                    }, offer);
                }
            }, new MediaConstraints());
        } catch (Exception error) {
            cleanup(true);
            call.reject(String.valueOf(error.getMessage()));
        }
    }

    private synchronized void sendOffer() {
        if (offered || pending == null || pc == null || pc.getLocalDescription() == null) return;
        offered = true;
        JSObject result = new JSObject();
        result.put("sdp", pc.getLocalDescription().description);
        pending.resolve(result);
        pending = null;
    }

    @PluginMethod
    public void answer(PluginCall call) {
        String sdp = call.getString("sdp");
        if (pc == null || sdp == null) {
            call.reject("not sharing");
            return;
        }
        pc.setRemoteDescription(new Sdp() {
            @Override
            public void onSetSuccess() {
                call.resolve();
            }

            @Override
            public void onSetFailure(String error) {
                call.reject(error);
            }
        }, new SessionDescription(SessionDescription.Type.ANSWER, sdp));
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.post(() -> {
            cleanup(true);
            call.resolve();
        });
    }

    private void cleanup(boolean stopService) {
        if (capturer != null) {
            try {
                capturer.stopCapture();
            } catch (Exception ignored) {
                /* already stopped */
            }
            capturer.dispose();
            capturer = null;
        }
        if (pc != null) {
            pc.dispose();
            pc = null;
        }
        if (track != null) {
            track.dispose();
            track = null;
        }
        if (source != null) {
            source.dispose();
            source = null;
        }
        if (helper != null) {
            helper.dispose();
            helper = null;
        }
        if (pending != null) {
            pending.reject("stopped");
            pending = null;
        }
        if (stopService) getContext().stopService(new Intent(getContext(), ScreenShareService.class));
    }

    @Override
    protected void handleOnDestroy() {
        cleanup(true);
    }

    private class Observer implements PeerConnection.Observer {
        @Override
        public void onIceGatheringChange(PeerConnection.IceGatheringState state) {
            if (state == PeerConnection.IceGatheringState.COMPLETE) main.post(ScreenSharePlugin.this::sendOffer);
        }

        @Override public void onSignalingChange(PeerConnection.SignalingState state) {}
        @Override public void onIceConnectionChange(PeerConnection.IceConnectionState state) {}
        @Override public void onIceConnectionReceivingChange(boolean receiving) {}
        @Override public void onIceCandidate(IceCandidate candidate) {}
        @Override public void onIceCandidatesRemoved(IceCandidate[] candidates) {}
        @Override public void onAddStream(MediaStream stream) {}
        @Override public void onRemoveStream(MediaStream stream) {}
        @Override public void onDataChannel(DataChannel channel) {}
        @Override public void onRenegotiationNeeded() {}
        @Override public void onAddTrack(RtpReceiver receiver, MediaStream[] streams) {}
    }

    private static class Sdp implements SdpObserver {
        @Override public void onCreateSuccess(SessionDescription description) {}
        @Override public void onSetSuccess() {}
        @Override public void onCreateFailure(String error) {}
        @Override public void onSetFailure(String error) {}
    }
}
