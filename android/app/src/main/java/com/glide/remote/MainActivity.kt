package com.glide.remote

import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.*
import android.widget.*
import android.text.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import okhttp3.*
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.pow

class MainActivity : AppCompatActivity() {
 private val ink=Color.rgb(23,24,21); private val panel=Color.rgb(35,36,32); private val line=Color.rgb(58,60,54); private val lime=Color.rgb(217,255,85); private val white=Color.rgb(244,244,237); private val muted=Color.rgb(158,161,149)
 private lateinit var status:TextView; private lateinit var dot:TextView; private lateinit var scanButton:Button
 private var ws:WebSocket?=null; private val client=OkHttpClient.Builder().pingInterval(20,java.util.concurrent.TimeUnit.SECONDS).build()
 private var scrollPending=0f; private var scrollFrame=false
 private val points=mutableMapOf<Int,Pair<Float,Float>>(); private var moved=false; private var maxPointers=0
 private var filteredX=0f; private var filteredY=0f; private var scrollRemainder=0f; private var pendingX=0f; private var pendingY=0f; private var frameQueued=false
 private var textUpdating=false; private var streamedText=""

 override fun onCreate(state:Bundle?){super.onCreate(state);window.statusBarColor=ink;window.navigationBarColor=ink;buildUi()}
 override fun onPause(){scrollPending=0f;pendingX=0f;pendingY=0f;points.clear();super.onPause()}

 private fun buildUi(){
  val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(20),dp(16),dp(20),dp(18));setBackgroundColor(ink)}
  ViewCompat.setOnApplyWindowInsetsListener(root){v,insets->val safe=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout());v.setPadding(dp(20)+safe.left,dp(16)+safe.top,dp(20)+safe.right,dp(18)+safe.bottom);insets}
  val header=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL}
  header.addView(ImageView(this).apply{setImageResource(R.drawable.ic_launcher);scaleType=ImageView.ScaleType.FIT_CENTER},LinearLayout.LayoutParams(dp(46),dp(46)))
  val titles=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(12),0,0,0)}
  titles.addView(label("GLIDE",21f,white,true));titles.addView(label("REMOTE CONTROL",10f,muted,true).apply{letterSpacing=.18f});header.addView(titles,LinearLayout.LayoutParams(0,-2,1f));dot=label("●",17f,muted,false);header.addView(dot);root.addView(header)
  val card=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(18),dp(16),dp(18),dp(16));background=round(panel,18,line)}
  status=label("Ready to connect",18f,white,true);card.addView(status);card.addView(label("Scan the code shown on your PC. Everything stays on your local Wi‑Fi.",12f,muted,false).apply{setPadding(0,dp(5),0,dp(13));setLineSpacing(0f,1.15f)})
  scanButton=button("SCAN PC CODE",true){openScanner()};card.addView(scanButton,LinearLayout.LayoutParams(-1,dp(50)));root.addView(card,LinearLayout.LayoutParams(-1,-2).apply{setMargins(0,dp(20),0,dp(14))})
  val mediaTitle=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL};mediaTitle.addView(label("MEDIA",11f,muted,true).apply{letterSpacing=.16f},LinearLayout.LayoutParams(0,-2,1f));mediaTitle.addView(label("QUICK CONTROLS",10f,muted,false));root.addView(mediaTitle)
  val media=LinearLayout(this);listOf("previous" to "‹‹","playpause" to "▶","next" to "››","volumedown" to "−","volumemute" to "M","volumeup" to "+").forEach{(key,glyph)->media.addView(button(glyph,key=="playpause"){send("key",key)},LinearLayout.LayoutParams(0,dp(48),1f).apply{setMargins(dp(3),0,dp(3),0)})};root.addView(media,LinearLayout.LayoutParams(-1,-2).apply{setMargins(-dp(3),dp(9),-dp(3),dp(14))})
  val pad=FrameLayout(this).apply{background=round(Color.rgb(29,30,27),24,line);isHapticFeedbackEnabled=true;setOnTouchListener{v,e->touch(v,e)}}
  val hint=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;isClickable=false};hint.addView(label("⌁",38f,lime,false).apply{gravity=17});hint.addView(label("GLIDE ANYWHERE",13f,white,true).apply{gravity=17;letterSpacing=.12f});hint.addView(label("Tap to click  ·  Two fingers to scroll",11f,muted,false).apply{gravity=17;setPadding(0,dp(8),0,0)});pad.addView(hint,FrameLayout.LayoutParams(-1,-1));root.addView(pad,LinearLayout.LayoutParams(-1,dp(360)))
  val clicks=LinearLayout(this);clicks.addView(button("LEFT CLICK",false){send("click","left")},LinearLayout.LayoutParams(0,dp(56),1f).apply{setMargins(0,0,dp(5),0)});clicks.addView(button("RIGHT CLICK",false){send("click","right")},LinearLayout.LayoutParams(0,dp(56),1f).apply{setMargins(dp(5),0,0,0)});root.addView(clicks,LinearLayout.LayoutParams(-1,-2).apply{setMargins(0,dp(12),0,dp(10))})
  val scroll=ScrollView(this).apply{isFillViewport=true;setBackgroundColor(ink);addView(root,FrameLayout.LayoutParams(-1,-2))}
  pad.minimumHeight=dp(180)
  pad.setOnTouchListener{v,e->v.parent.requestDisallowInterceptTouchEvent(e.actionMasked!=MotionEvent.ACTION_UP&&e.actionMasked!=MotionEvent.ACTION_CANCEL);touch(v,e)}
  val typing=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL}
  val entry=EditText(this).apply{setHint("Type into the active PC app…");setHintTextColor(muted);setTextColor(white);textSize=14f;setSingleLine(true);imeOptions=android.view.inputmethod.EditorInfo.IME_ACTION_DONE;setPadding(dp(14),0,dp(10),0);background=round(panel,15,line)}
  typing.addView(entry,LinearLayout.LayoutParams(0,dp(52),1f).apply{setMargins(0,0,dp(8),0)})
  typing.addView(button("CLEAR",false){textUpdating=true;entry.text.clear();streamedText="";textUpdating=false},LinearLayout.LayoutParams(dp(82),dp(52)))
  entry.addTextChangedListener(object:TextWatcher{
   override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){}
   override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){}
   override fun afterTextChanged(editable:Editable?){
    if(textUpdating)return
     val current=editable?.toString() ?: ""
    var common=0
    while(common<streamedText.length&&common<current.length&&streamedText[common]==current[common])common++
    repeat(streamedText.length-common){send("key","backspace")}
    if(current.length>common)ws?.send(JSONObject().put("type","text").put("text",current.substring(common)).toString())
    streamedText=current
   }
  })
  root.addView(typing,LinearLayout.LayoutParams(-1,-2).apply{setMargins(0,dp(12),0,dp(8))})
  root.addView(button("ENTER  ↵",false){send("key","enter")},LinearLayout.LayoutParams(-1,dp(46)).apply{setMargins(0,0,0,dp(10))})
  root.addView(label("Glide Remote · Touch, scroll, control.",10f,muted,false).apply{gravity=17;setPadding(0,dp(8),0,0)})
  setContentView(scroll)
 }

 private val scanner=registerForActivityResult(ScanContract()){it.contents?.let(::connect)}
 private fun openScanner()=scanner.launch(ScanOptions().apply{setCaptureActivity(ScannerActivity::class.java);setDesiredBarcodeFormats(ScanOptions.QR_CODE);setPrompt("");setBeepEnabled(false);setOrientationLocked(true)})
 private fun connect(url:String){ws?.close(1000,"New connection");val endpoint=url.replaceFirst("http://","ws://").replaceFirst("https://","wss://").replace("/?token=","/ws?token=");setStatus("Connecting…",false);ws=client.newWebSocket(Request.Builder().url(endpoint).build(),object:WebSocketListener(){override fun onOpen(w:WebSocket,r:Response){setStatus("Connected to your PC",true);w.send(JSONObject().put("type","hello").put("device",android.os.Build.MODEL).toString())};override fun onClosed(w:WebSocket,c:Int,r:String)=setStatus("Disconnected — scan again",false);override fun onFailure(w:WebSocket,t:Throwable,r:Response?){val detail=r?.code?.let{"HTTP $it"}?:t.message?.take(28)?:"network error";setStatus("Connection failed · $detail",false)}})}
 private fun setStatus(value:String,connected:Boolean)=runOnUiThread{status.text=value;dot.setTextColor(if(connected)lime else muted);scanButton.text=if(connected)"CONNECTED  ✓" else "SCAN PC CODE"}
 private fun send(type:String,value:String){ws?.send(JSONObject().put("type",type).put(if(type=="key")"key" else "button",value).toString())}
 private fun move(dx:Float,dy:Float){pendingX+=dx;pendingY+=dy;if(frameQueued)return;frameQueued=true;Choreographer.getInstance().postFrameCallback{frameQueued=false;val x=pendingX;val y=pendingY;pendingX=0f;pendingY=0f;if(abs(x)+abs(y)>.08f)ws?.send(JSONObject().put("type","move").put("dx",x).put("dy",y).toString())}}
 private fun curve(v:Float):Float{val sign=if(v<0)-1 else 1;return sign*(abs(v).pow(1.12f)*1.35f).coerceAtMost(120f)}
 private fun queueScroll(delta:Float){
  scrollPending+=delta
  if(scrollFrame)return
  scrollFrame=true
  Choreographer.getInstance().postFrameCallback{
   scrollFrame=false
   val amount=scrollPending.coerceIn(-8f,8f);scrollPending=0f
   if(abs(amount)>.0001f)ws?.send(JSONObject().put("type","scroll").put("delta",amount).toString())
  }
 }
 private fun touch(view:View,e:MotionEvent):Boolean{
  fun remember(){points.clear();for(i in 0 until e.pointerCount)if(!(e.actionMasked==MotionEvent.ACTION_POINTER_UP&&i==e.actionIndex))points[e.getPointerId(i)]=e.getX(i) to e.getY(i)}
  when(e.actionMasked){
   MotionEvent.ACTION_DOWN->{moved=false;maxPointers=1;scrollRemainder=0f;remember()}
   MotionEvent.ACTION_POINTER_DOWN->{maxPointers=maxOf(maxPointers,e.pointerCount);remember()}
   MotionEvent.ACTION_POINTER_UP->remember()
   MotionEvent.ACTION_MOVE->{
    var dx=0f;var dy=0f;var count=0
    for(i in 0 until e.pointerCount){val previous=points[e.getPointerId(i)]?:continue;dx+=e.getX(i)-previous.first;dy+=e.getY(i)-previous.second;count++}
    if(count>0){dx/=count;dy/=count
     scrollRemainder+=abs(dx)+abs(dy)
     if(scrollRemainder>ViewConfiguration.get(this).scaledTouchSlop)moved=true
     if(e.pointerCount>=2){queueScroll(dy/(resources.displayMetrics.density*48f))}
     else if(maxPointers==1){move(curve(dx/resources.displayMetrics.density),curve(dy/resources.displayMetrics.density))}
    }
    remember()
   }
   MotionEvent.ACTION_UP->{if(!moved){send("click",if(maxPointers>1)"right" else "left");view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)};points.clear()}
   MotionEvent.ACTION_CANCEL->{points.clear();scrollPending=0f}
  }
  return true
 }
 private fun label(value:String,size:Float,color:Int,bold:Boolean)=TextView(this).apply{text=value;textSize=size;setTextColor(color);includeFontPadding=false;if(bold)setTypeface(typeface,Typeface.BOLD)}
 private fun button(value:String,primary:Boolean,action:(View)->Unit)=Button(this).apply{text=value;textSize=12f;isAllCaps=false;letterSpacing=.08f;setTypeface(typeface,Typeface.BOLD);stateListAnimator=null;minWidth=0;minimumWidth=0;setPadding(dp(4),0,dp(4),0);setTextColor(if(primary)ink else white);background=android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf(0x33FFFFFF),round(if(primary)lime else panel,15,if(primary)lime else line),null);setOnClickListener(action)}
 private fun round(color:Int,radius:Int,stroke:Int?=null)=GradientDrawable().apply{shape=GradientDrawable.RECTANGLE;setColor(color);cornerRadius=dp(radius).toFloat();stroke?.let{setStroke(dp(1),it)}}
 private fun dp(v:Int)=(v*resources.displayMetrics.density).toInt()
 override fun onDestroy(){ws?.close(1000,"App closed");client.dispatcher.executorService.shutdown();super.onDestroy()}
}

