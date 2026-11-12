// GLSL for the Apollo orb.

const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

/* ---------- shell: noise-displaced sphere, fresnel thin-film glass ---------- */

export const shellVert = /* glsl */ `
uniform float uT; uniform float uDisp; uniform float uFreq; uniform float uOct;
varying vec3 vN; varying vec3 vV; varying float vNoise;
${NOISE}
float field(vec3 p){
  return snoise(p*uFreq+vec3(0.,uT*.6,uT*.35))+uOct*snoise(p*uFreq*2.2-vec3(uT*.8));
}
vec3 surf(vec3 n){return n*(1.+field(n)*uDisp);}
void main(){
  vec3 n=normalize(position);
  vec3 t=normalize(cross(n,abs(n.y)<.99?vec3(0.,1.,0.):vec3(1.,0.,0.)));
  vec3 b=cross(n,t);
  float e=.03;
  vec3 p=surf(n);
  vec3 pt=surf(normalize(n+t*e));
  vec3 pb=surf(normalize(n+b*e));
  vec3 nn=normalize(cross(pt-p,pb-p));
  vNoise=field(n);
  vec4 mv=modelViewMatrix*vec4(p,1.);
  vN=normalize(normalMatrix*nn);
  vV=normalize(-mv.xyz);
  gl_Position=projectionMatrix*mv;
}`;

export const shellFrag = /* glsl */ `
uniform float uT;
uniform vec3 uBase; uniform vec3 uRimA; uniform vec3 uRimB;
uniform float uIri; uniform float uCoreAlpha; uniform float uFilmMix; uniform float uFresPow;
uniform float uSpec; uniform float uShade; uniform float uScan; uniform float uScanPx; uniform float uPulse;
varying vec3 vN; varying vec3 vV; varying float vNoise;
void main(){
  vec3 N=normalize(vN); vec3 V=normalize(vV);
  float ndv=max(dot(N,V),0.);
  float fres=pow(1.-ndv,uFresPow);
  vec3 rim=mix(uRimA,uRimB,.5+.5*sin(vNoise*3.+uT*.25+N.y*2.2));
  vec3 rainbow=.62+.38*cos(6.2832*(fres*.9+vNoise*.3+N.x*.2+uT*.03+vec3(0.,.42,.62)));
  rim=mix(rim,mix(rim,rainbow,.85),uIri);
  float f=smoothstep(0.,1.,(fres+vNoise*.12*uIri)*uFilmMix);
  vec3 col=mix(uBase,rim,f);
  // soft form shading (light presets) and a top-left highlight
  col*=1.-uShade*(.5-.5*N.y)*(1.-f*.6);
  vec3 L=normalize(vec3(-.5,.7,.6));
  float spec=pow(max(dot(reflect(-L,N),V),0.),90.);
  col+=spec*uSpec;
  col*=1.+uPulse*.35;
  float a=mix(uCoreAlpha,1.,f);
  a=max(a,spec*uSpec);
  if(uScan>0.){
    float s=step(.5,fract(gl_FragCoord.y/uScanPx));
    a*=mix(1.,s,uScan);
  }
  gl_FragColor=vec4(col,a);
}`;

/* ---------- ribbon: twisted line-mesh wave inside the sphere ---------- */
// position.xy = (u along, v across), both 0..1

export const ribbonVert = /* glsl */ `
uniform float uT; uniform float uAmp; uniform float uTwist; uniform float uLevel;
varying float vU; varying float vV2; varying float vEnv;
${NOISE}
void main(){
  float u=position.x, v=position.y;
  float x=(u*2.-1.)*.9;
  float env=sqrt(max(1.-x*x/.84,0.));
  float w=(v-.5)*.95*env;
  float ang=x*uTwist+uT*.45;
  float wave=sin(x*4.2+uT*1.3+v*1.4)*.42
            +sin(x*7.5-uT*1.9+v*2.8)*.2*(1.+uLevel*2.5)
            +snoise(vec3(x*1.7,v*1.2,uT*.35))*.3;
  float y=wave*env*uAmp+w*sin(ang);
  float z=w*cos(ang);
  // keep inside the sphere
  vec3 p=vec3(x,y,z);
  float r=length(p); if(r>.93)p*=.93/r;
  vU=u; vV2=v; vEnv=env;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
}`;

export const ribbonFrag = /* glsl */ `
uniform vec3 uA; uniform vec3 uB; uniform float uOn; uniform float uLevel; uniform float uAlpha;
varying float vU; varying float vV2; varying float vEnv;
void main(){
  vec3 col=mix(uA,uB,smoothstep(0.,1.,vU*.8+vV2*.35));
  float a=uAlpha*uOn*smoothstep(0.,.25,vEnv)*(.55+.45*sin(vV2*3.1416))*(1.+uLevel*.8);
  gl_FragColor=vec4(col,a);
}`;

/* ---------- ring: outer aura of flowing ribbon lines ---------- */

export const ringVert = /* glsl */ `
uniform float uT; uniform float uLevel; uniform float uRadius; uniform float uEnergy;
varying float vU; varying float vV2;
void main(){
  float u=position.x, v=position.y;
  float a=u*6.2831853;
  float k=.5+uEnergy*.5+uLevel*1.4;
  float r=uRadius
    +sin(a*3.+uT+v*2.2)*.075*k
    +sin(a*5.-uT*.7+v*4.)*.045*k
    +(v-.5)*.2*sin(a*2.+uT*.8);
  float z=sin(a*2.+uT*.6+v*3.)*.2*k+(v-.5)*.12*cos(a*3.-uT*.5);
  vU=u; vV2=v;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(cos(a)*r,sin(a)*r,z,1.);
}`;

export const ringFrag = /* glsl */ `
uniform vec3 uA; uniform vec3 uB; uniform float uOn; uniform float uAlpha;
varying float vU; varying float vV2;
void main(){
  vec3 col=mix(uA,uB,.5+.5*sin(vU*6.2831853+vV2*2.));
  gl_FragColor=vec4(col,uAlpha*uOn*(.4+.6*sin(vV2*3.1416)));
}`;

/* ---------- core: soft glow / sun disc behind the shell ---------- */

export const coreVert = /* glsl */ `
varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

export const coreFrag = /* glsl */ `
uniform vec3 uColor; uniform float uIntensity; uniform float uHalf; uniform float uPulse;
varying vec2 vUv;
void main(){
  float d=length(vUv-.5)*2.*uHalf; // in orb radii
  float disc=smoothstep(1.0,.9,d)*(.55+.45*smoothstep(.2,1.,d));
  float halo=exp(-max(d-.95,0.)*5.5)*.6;
  float inner=exp(-d*d*2.2)*.35;
  float g=(disc*smoothstep(.15,.9,uIntensity)+halo*uIntensity+inner)*uIntensity*(1.+uPulse*.5);
  gl_FragColor=vec4(uColor*g,g);
}`;
